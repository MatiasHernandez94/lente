import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { getClient } from "@/lib/db";
import type { VideoRow } from "@/lib/schema";
import { ApiServiceError } from "@/lib/services/videoService";

const execFileAsync = promisify(execFile);
const MAX_CLIP_SECONDS = 120;
const UPLOADS_DIR = join(process.cwd(), "data", "uploads");
const CLIPS_BUCKET = "clips";

function ffmpegBin(): string {
  const bin = join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
  if (!existsSync(bin)) {
    throw new ApiServiceError(500, "ffmpeg no está disponible en este servidor.");
  }
  return bin;
}

export function ytdlpPath(): string {
  const fromEnv = process.env.YT_DLP_PATH;
  if (fromEnv) return fromEnv;
  const pipPath = join(process.env.HOME ?? "", "Library", "Python", "3.14", "bin", "yt-dlp");
  if (existsSync(pipPath)) return pipPath;
  return "yt-dlp";
}

export function resolveClipRange(
  video: VideoRow,
  minutoInicio: number,
  minutoFin: number | null | undefined,
): { start: number; duration: number } {
  const start = Math.max(0, Math.round(minutoInicio * 60));
  const videoSeconds = video.durationSeconds ?? 0;
  if (videoSeconds > 0 && start >= videoSeconds) {
    throw new ApiServiceError(400, "El minuto indicado supera la duración del video.");
  }
  const endCap = videoSeconds > 0 ? videoSeconds : start + MAX_CLIP_SECONDS;
  const requestedEnd = minutoFin && minutoFin > minutoInicio ? Math.round(minutoFin * 60) : endCap;
  const duration = Math.min(Math.max(1, requestedEnd - start), MAX_CLIP_SECONDS);
  return { start, duration };
}

/** Recorta un segmento del video fuente y lo devuelve como buffer MP4. */
export async function extractClip(video: VideoRow, start: number, duration: number): Promise<Buffer> {
  const ffmpeg = ffmpegBin();
  const outFile = join(tmpdir(), `clip-${randomUUID()}.mp4`);

  try {
    if (video.sourceType === "youtube") {
      if (!video.sourceRef) throw new ApiServiceError(400, "El video no tiene URL de YouTube.");
      const downloaded = await downloadYoutubeSection(video.sourceRef, start, duration);
      await transcodeToMp4(downloaded, outFile, ffmpeg);
    } else {
      if (!video.sourceRef) throw new ApiServiceError(400, "El video no tiene archivo fuente.");
      const source = join(UPLOADS_DIR, video.sourceRef);
      if (!existsSync(source)) {
        throw new ApiServiceError(410, "El archivo de video ya no está disponible en el servidor.");
      }
      await transcodeToMp4(source, outFile, ffmpeg, start, duration);
    }
    return readFileSync(outFile);
  } finally {
    if (existsSync(outFile)) unlinkSync(outFile);
  }
}

async function downloadYoutubeSection(url: string, start: number, duration: number): Promise<string> {
  const outPattern = join(tmpdir(), `clip-yt-${randomUUID()}.%(ext)s`);
  const section = `*${toClock(start)}-${toClock(start + duration)}`;
  try {
    await execFileAsync(
      ytdlpPath(),
      ["--no-playlist", "-f", "bv*+ba/b", "--download-sections", section, "-o", outPattern, url],
      { timeout: 60000 * 10 },
    );
  } catch (error) {
    throw new ApiServiceError(502, `No se pudo descargar el segmento de YouTube: ${stderrTail(error)}`);
  }
  for (const ext of [".mp4", ".mkv", ".webm", ".m4a"]) {
    const candidate = outPattern.replace(".%(ext)s", `.${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  throw new ApiServiceError(502, "El segmento de YouTube no pudo obtener un archivo.");
}

async function transcodeToMp4(
  source: string,
  out: string,
  ffmpeg: string,
  start?: number,
  duration?: number,
): Promise<void> {
  const args: string[] = [];
  if (start !== undefined) {
    args.push("-ss", toClock(start));
  }
  args.push("-i", source);
  if (duration !== undefined) {
    args.push("-t", String(duration));
  }
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    "-y",
    out,
  );
  try {
    await execFileAsync(ffmpeg, args, { timeout: 60000 * 8 });
  } catch (error) {
    throw new ApiServiceError(500, `No se pudo procesar el clip: ${stderrTail(error)}`);
  }
}

/** Sube el clip al bucket público `clips` y devuelve su URL pública. */
export async function uploadClip(buffer: Buffer, mime: string): Promise<string> {
  const ext = mime === "video/webm" ? "webm" : "mp4";
  const path = `${randomUUID()}.${ext}`;
  const storage = getClient().storage;

  const { data: existingBucket } = await storage.getBucket(CLIPS_BUCKET);
  if (!existingBucket) {
    const { error: bucketError } = await storage.createBucket(CLIPS_BUCKET, { public: true });
    if (bucketError) throw new ApiServiceError(500, `No se pudo crear el bucket de clips: ${bucketError.message}`);
  }

  const { error: uploadError } = await storage.from(CLIPS_BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: false,
  });
  if (uploadError) {
    throw new ApiServiceError(500, `No se pudo subir el clip: ${uploadError.message}`);
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${url}/storage/v1/object/public/${CLIPS_BUCKET}/${path}`;
}

function toClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function stderrTail(error: unknown): string {
  const err = error as { stderr?: string; message?: string } | null;
  if (err?.stderr) return err.stderr.split("\n").filter(Boolean).slice(-3).join(" | ");
  return err?.message ?? "error desconocido";
}