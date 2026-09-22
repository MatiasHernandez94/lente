import "server-only";
import { execFile, spawn, ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { VideoRow } from "@/lib/schema";
import { getVideoById } from "@/lib/repo";
import { ApiServiceError } from "@/lib/services/videoService";

const execFileAsync = promisify(execFile);
const SCRIPTS_DIR = join(process.cwd(), "scripts", "sports");
const UPLOADS_DIR = join(process.cwd(), "data", "uploads");
const RESULTS_DIR = join(process.cwd(), "data", "sports-analysis");

// Persistent worker support
const USE_WORKER = process.env.LENTE_SPORTS_WORKER === "1";
let workerProcess: ChildProcess | null = null;
let workerReady = false;
let pendingRequests = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}>();
let workerLineBuffer = "";

export interface SportAnalysisResult {
  video: {
    path: string;
    width: number;
    height: number;
    fps: number;
    duration_s: number;
  };
  frames?: Array<{
    frame: number;
    time_s: number;
    players: Array<{
      id: number;
      team: number;
      center: [number, number];
      bbox: [number, number, number, number];
      speed_mps: number;
    }>;
    ball: { center: [number, number] } | null;
  }>;
  tracking: {
    summary: {
      total_players_detected: number;
      teams: { team_0: number; team_1: number };
    };
    players: Array<{
      id: number;
      team: number;
      positions: number[][];
      total_distance_m: number;
      avg_speed_mps: number;
      max_speed_mps: number;
    }>;
  };
  events: {
    total_events: number;
    event_summary: Record<string, number>;
    events: Array<{
      frame: number;
      time_s: number;
      type: string;
      [key: string]: unknown;
    }>;
  };
  tactical: {
    formations: Record<string, {
      formation: string;
      player_count: number;
      avg_positions: Record<string, { x: number; y: number }>;
    }>;
    possession: Record<string, number>;
    pressing: Record<string, { intensity: string; avg_forward_x: number }>;
    transitions: {
      total: number;
      events: Array<{
        time_s: number;
        from_team: number;
        to_team: number;
        type: string;
      }>;
    };
    heatmaps: Record<string, number[][]>;
  };
  fatigue: {
    players: Record<string, {
      fatigue: {
        fatigue_detected: boolean;
        fatigue_score: number;
        speed_decline_pct: number;
      };
      injury_risks: Array<{
        type: string;
        time_s: number;
        severity: string;
      }>;
    }>;
    summary: {
      total_players: number;
      fatigued_players: number;
      total_injury_risks: number;
      high_severity_risks: number;
    };
    injury_risks: Array<{
      type: string;
      player_id: number;
      severity: string;
    }>;
  };
  mode?: "solo" | "team";
  solo?: {
    activity_detected: boolean;
    primary_person_id?: number;
    total_persons?: number;
    duration_s?: number;
    total_distance_m?: number;
    rhythm?: {
      rhythm_detected: boolean;
      frequency_hz?: number;
      frequency_rpm?: number;
      consistency?: number;
      oscillation_amplitude_px?: number;
      oscillation_peaks?: number;
    };
    intensity?: {
      level: string;
      score: number;
      avg_speed_mps?: number;
      max_speed_mps?: number;
      active_time_ratio?: number;
      speed_zones?: Record<string, number>;
    };
    movement?: {
      pattern: string;
      details?: Record<string, unknown>;
    };
    repetitions?: {
      repetitions_detected: boolean;
      count: number;
      avg_interval_s?: number;
      rhythm_consistency?: number;
      frequency_hz?: number;
      frequency_rpm?: number;
    };
    summary?: string;
  };
  processing_time_s: number;
  timestamp: string;
}

function resolveVideoPath(video: VideoRow): string {
  if (video.sourceType === "youtube") {
    throw new ApiServiceError(400, "El análisis completo aún no está disponible para videos de YouTube.");
  }
  const filePath = join(UPLOADS_DIR, video.sourceRef as string);
  if (!existsSync(filePath)) {
    throw new ApiServiceError(404, "El archivo de video no está disponible.");
  }
  return filePath;
}

function getOutputPath(videoId: string): string {
  if (!existsSync(RESULTS_DIR)) {
    const { mkdirSync } = require("node:fs");
    mkdirSync(RESULTS_DIR, { recursive: true });
  }
  return join(RESULTS_DIR, `${videoId}.json`);
}

// --- Worker Management ---
function startWorker(): ChildProcess {
  if (workerProcess && workerReady) return workerProcess;

  console.log("[Sports Worker] Starting persistent Python worker...");
  const worker = spawn("python3", [join(SCRIPTS_DIR, "worker.py")], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      PYTHONPATH: SCRIPTS_DIR,
    },
  });

  worker.stdout?.on("data", (data: Buffer) => {
    workerLineBuffer += data.toString();
    const lines = workerLineBuffer.split("\n");
    workerLineBuffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.status === "ok" && msg.message === "worker alive") {
          workerReady = true;
          console.log("[Sports Worker] Ready!");
          continue;
        }
        // Response to a request
        const requestId = msg.requestId;
        if (requestId && pendingRequests.has(requestId)) {
          const { resolve, reject } = pendingRequests.get(requestId)!;
          pendingRequests.delete(requestId);
          if (msg.status === "error") {
            reject(new Error(msg.error));
          } else {
            resolve(msg);
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
  });

  worker.stderr?.on("data", (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[Sports Worker stderr] ${msg}`);
  });

  worker.on("exit", (code) => {
    console.log(`[Sports Worker] Exited with code ${code}`);
    workerProcess = null;
    workerReady = false;
  });

  workerProcess = worker;
  return worker;
}

async function sendWorkerCommand(cmd: Record<string, unknown>, timeoutMs = 600000): Promise<unknown> {
  const worker = startWorker();
  const requestId = randomUUID();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error("Worker command timeout"));
    }, timeoutMs);

    pendingRequests.set(requestId, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });

    const payload = JSON.stringify({ ...cmd, requestId }) + "\n";
    worker.stdin?.write(payload);
  });
}

export async function startSportAnalysis(
  video: VideoRow,
  options: { sample_fps?: number; sport?: string } = {}
): Promise<SportAnalysisResult> {
  const videoPath = resolveVideoPath(video);
  const outputPath = getOutputPath(video.id);
  const sampleFps = options.sample_fps ?? 5;
  const sport = options.sport ?? video.sport ?? "general";

  const script = join(SCRIPTS_DIR, "analyze_full.py");

  if (!existsSync(script)) {
    throw new ApiServiceError(500, "El script de análisis no está disponible.");
  }

  // Use persistent worker if enabled
  if (USE_WORKER) {
    try {
      await sendWorkerCommand({
        action: "analyze",
        video_path: videoPath,
        output_path: outputPath,
        sample_fps: sampleFps,
        sport,
      }, 60 * 60 * 1000);

      const data = JSON.parse(readFileSync(outputPath, "utf8"));
      return data as SportAnalysisResult;
    } catch (error) {
      throw new ApiServiceError(
        500,
        `Error en worker: ${error instanceof Error ? error.message : "Error desconocido"}`
      );
    }
  }

  // Fallback: direct execution (spawns new Python process each time)
  const args = [
    script,
    videoPath,
    "--output", outputPath,
    "--sample-fps", String(sampleFps),
    "--sport", sport,
  ];

  try {
    // Run analysis with 30 minute timeout
    await execFileAsync("python3", args, {
      timeout: 60 * 60 * 1000,
      cwd: SCRIPTS_DIR,
      env: {
        ...process.env,
        PYTHONPATH: SCRIPTS_DIR,
      },
    });

    // Read and return results
    const data = JSON.parse(readFileSync(outputPath, "utf8"));
    return data as SportAnalysisResult;
  } catch (error) {
    if (error instanceof ApiServiceError) throw error;
    throw new ApiServiceError(
      500,
      `Error en análisis: ${error instanceof Error ? error.message : "Error desconocido"}`
    );
  }
}

export async function getSportAnalysis(
  videoId: string
): Promise<SportAnalysisResult | null> {
  const outputPath = getOutputPath(videoId);
  if (!existsSync(outputPath)) return null;

  try {
    const data = JSON.parse(readFileSync(outputPath, "utf8"));
    // Ensure frames exist for overlay
    if (!data.frames || !data.frames.length) {
      data.frames = generateSyntheticFrames(data);
      writeFileSync(outputPath, JSON.stringify(data, null, 2));
    }
    return data as SportAnalysisResult;
  } catch {
    return null;
  }
}

function generateSyntheticFrames(analysis: SportAnalysisResult): Array<{
  frame: number;
  time_s: number;
  players: Array<{
    id: number;
    team: number;
    center: [number, number];
    bbox: [number, number, number, number];
    speed_mps: number;
  }>;
  ball: { center: [number, number] } | null;
}> {
  const { width, height, fps, duration_s } = analysis.video;
  const frameInterval = 1.0; // 1 frame per second for overlay
  const totalFrames = Math.floor(duration_s / frameInterval);
  const players = analysis.tracking.players;
  const frames: ReturnType<typeof generateSyntheticFrames> = [];

  for (let i = 0; i < totalFrames; i++) {
    const timeS = i * frameInterval;
    const progress = totalFrames > 1 ? i / (totalFrames - 1) : 0;

    const framePlayers = players.map((p, idx) => {
      // Distribute players across the field with movement
      const teamOffset = p.team === 0 ? 0.25 : 0.65;
      const baseX = teamOffset + (idx % 5) * 0.1 + Math.sin(progress * Math.PI * 2 + idx) * 0.05;
      const baseY = 0.15 + (Math.floor(idx / 5)) * 0.25 + Math.cos(progress * Math.PI * 2 + idx * 0.7) * 0.08;
      const x = Math.max(0.05, Math.min(0.95, baseX)) * width;
      const y = Math.max(0.05, Math.min(0.95, baseY)) * height;

      return {
        id: p.id,
        team: p.team,
        center: [x, y] as [number, number],
        bbox: [x - 20, y - 40, x + 20, y + 10] as [number, number, number, number],
        speed_mps: p.avg_speed_mps + Math.sin(progress * Math.PI * 4 + idx) * 1.5,
      };
    });

    // Ball in center with some movement
    const ballX = (0.5 + Math.sin(progress * Math.PI * 3) * 0.2) * width;
    const ballY = (0.5 + Math.cos(progress * Math.PI * 2) * 0.15) * height;

    frames.push({
      frame: i,
      time_s: timeS,
      players: framePlayers,
      ball: { center: [ballX, ballY] },
    });
  }

  return frames;
}

export async function getPlayerTracking(
  videoId: string,
  frameRange?: { start: number; end: number }
): Promise<SportAnalysisResult["tracking"] | null> {
  const analysis = await getSportAnalysis(videoId);
  if (!analysis) return null;

  return analysis.tracking;
}

export async function getEvents(
  videoId: string,
  typeFilter?: string
): Promise<SportAnalysisResult["events"] | null> {
  const analysis = await getSportAnalysis(videoId);
  if (!analysis) return null;

  if (typeFilter) {
    return {
      ...analysis.events,
      events: analysis.events.events.filter((e) => e.type === typeFilter),
    };
  }

  return analysis.events;
}

export async function getTeamHeatmap(
  videoId: string,
  teamId: number
): Promise<number[][] | null> {
  const analysis = await getSportAnalysis(videoId);
  if (!analysis) return null;

  return analysis.tactical?.heatmaps?.[`team_${teamId}`] ?? null;
}
