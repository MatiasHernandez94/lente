import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readdirSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { FrameImage } from "./providers/types";

const execFileAsync = promisify(execFile);

function ffmpegBin(): string {
  const bin = path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
  if (!existsSync(bin)) {
    throw new Error("ffmpeg no está disponible en este servidor.");
  }
  return bin;
}

export interface ExtractFramesOptions {
  count?: number;
  maxWidth?: number;
  sampleFps?: number;
}

export interface ExtractedFrame extends FrameImage {
  timeSeconds: number;
}

/**
 * Extrae `count` fotogramas distribuidos a lo largo del video como JPEG base64.
 * Usa el binario ffmpeg de ffmpeg-static. Lanza error si no se puede extraer.
 */
export async function extractVideoFrames(
  videoPath: string,
  { count = 3, maxWidth = 640 }: ExtractFramesOptions = {},
): Promise<ExtractedFrame[]> {
  const ffmpeg = ffmpegBin();
  if (count <= 0) return [];

  const outDir = path.join(tmpdir(), `lente-frames-${randomUUID()}`);
  const outPattern = path.join(outDir, "frame-%03d.jpg");
  mkdirSync(outDir, { recursive: true });

  const durationArg = await probeDuration(videoPath, ffmpeg);
  // Extraer frames distribuidos: fps tal que obtengamos ~count frames.
  const targetFps = Math.min(Math.max(0.5, count / Math.max(1, durationArg)), 1.0);
  const fpsFilter = `fps=${targetFps.toFixed(4)}`;

  try {
    await execFileAsync(
      ffmpeg,
      ["-i", videoPath, "-vf", `${fpsFilter},scale=${maxWidth}:-1`, "-frames:v", String(count), "-q:v", "3", outPattern],
      { timeout: 120_000 },
    );
  } catch (error) {
    throw new Error(`No se pudieron extraer los fotogramas: ${error instanceof Error ? error.message : "error"}`);
  }

  const files = readdirSync(outDir)
    .filter((f) => f.endsWith(".jpg"))
    .sort();
  if (files.length === 0) {
    throw new Error("No se pudieron extraer fotogramas del video.");
  }

  const frames: ExtractedFrame[] = files.map((file, i) => {
    const buf = readFileSync(path.join(outDir, file));
    const t0 = durationArg / Math.max(1, files.length);
    return {
      base64: buf.toString("base64"),
      mimeType: "image/jpeg",
      timeSeconds: Math.min(durationArg, i * t0),
    };
  });

  return frames;
}

async function probeDuration(videoPath: string, ffmpeg: string): Promise<number> {
  try {
    await execFileAsync(ffmpeg, ["-i", videoPath], { timeout: 15_000 });
  } catch (error) {
    // ffmpeg con "-i" solo termina en error pero imprime la metadata en stderr.
    const stderr = String(
      typeof error === "object" && error && "stderr" in error
        ? (error as { stderr: string }).stderr
        : "",
    );
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (match) {
      return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    }
  }
  return 10;
}