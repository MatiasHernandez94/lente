import "server-only";
import { spawn, ChildProcess } from "node:child_process";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const SCRIPTS_DIR = join(process.cwd(), "scripts", "sports");

export interface StreamSession {
  id: string;
  videoId: string;
  worker: ChildProcess;
  status: "starting" | "ready" | "processing" | "error" | "closed";
  frameBuffer: FrameDetection[];
  lastFrameId: number;
  onDetection?: (detection: FrameDetection) => void;
  onError?: (error: string) => void;
}

export interface FrameDetection {
  frame_id: number;
  players: Array<{
    bbox: [number, number, number, number];
    center: [number, number];
    confidence: number;
  }>;
  ball: {
    center: [number, number];
    confidence: number;
  } | null;
}

const sessions = new Map<string, StreamSession>();

export function createStreamSession(
  videoId: string,
  onDetection?: (detection: FrameDetection) => void,
  onError?: (error: string) => void,
): StreamSession {
  const id = randomUUID();
  const script = join(SCRIPTS_DIR, "detect_players_streaming.py");

  const worker = spawn("python3", [script], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      PYTHONPATH: SCRIPTS_DIR,
    },
  });

  const session: StreamSession = {
    id,
    videoId,
    worker,
    status: "starting",
    frameBuffer: [],
    lastFrameId: 0,
    onDetection,
    onError,
  };

  let lineBuffer = "";

  worker.stdout?.on("data", (data: Buffer) => {
    lineBuffer += data.toString();
    const lines = lineBuffer.split("\n");
    lineBuffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.type === "ready") {
          session.status = "ready";
          return;
        }
        if (msg.type === "detection") {
          session.lastFrameId = msg.frame_id;
          const detection: FrameDetection = {
            frame_id: msg.frame_id,
            players: msg.players || [],
            ball: msg.ball,
          };
          session.frameBuffer.push(detection);
          // Keep only last 100 frames in buffer
          if (session.frameBuffer.length > 100) {
            session.frameBuffer.shift();
          }
          session.onDetection?.(detection);
        }
        if (msg.type === "error") {
          session.onError?.(msg.message);
        }
      } catch {
        // Ignore parse errors
      }
    }
  });

  worker.stderr?.on("data", (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg && !msg.includes("Loading model")) {
      console.log(`[Stream Worker ${id}] ${msg}`);
    }
  });

  worker.on("exit", (code) => {
    session.status = "closed";
    sessions.delete(id);
    console.log(`[Stream Worker ${id}] Exited with code ${code}`);
  });

  sessions.set(id, session);
  return session;
}

export function sendFrame(sessionId: string, frameId: number, imageBase64: string): void {
  const session = sessions.get(sessionId);
  if (!session || session.status === "closed") return;

  const msg = JSON.stringify({
    type: "frame",
    frame_id: frameId,
    image: imageBase64,
  }) + "\n";

  session.worker.stdin?.write(msg);
}

export function closeStreamSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  session.worker.stdin?.write(JSON.stringify({ type: "shutdown" }) + "\n");
  session.worker.kill("SIGTERM");
  session.status = "closed";
  sessions.delete(sessionId);
}

export function getStreamSession(sessionId: string): StreamSession | undefined {
  return sessions.get(sessionId);
}
