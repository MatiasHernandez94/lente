import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { ApiServiceError } from "@/lib/services/videoService";

const execFileAsync = promisify(execFile);

export function ytdlpPath(): string {
  const fromEnv = process.env.YT_DLP_PATH;
  if (fromEnv) return fromEnv;
  const pipPath = join(process.env.HOME ?? "", "Library", "Python", "3.14", "bin", "yt-dlp");
  if (existsSync(pipPath)) return pipPath;
  return "yt-dlp";
}

/**
 * Descarga un video de YouTube a un archivo temporal usando yt-dlp y lo
 * devuelve como ruta local. Si `maxSeconds` está presente, solo descarga esa
 * sección inicial (para análisis rápidos o clips).
 */
export async function downloadYouTubeVideo(
  url: string,
  label: string,
  maxSeconds?: number,
): Promise<string> {
  const out = join(tmpdir(), `youtube-${label}-${randomUUID()}.%(ext)s`);
  const ffmpegBin = join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
  const args = [
    "--js-runtimes",
    "node",
    "--no-playlist",
    "-f",
    "bv*+ba/b",
    "--merge-output-format",
    "mp4",
    "-o",
    out,
  ];
  if (existsSync(ffmpegBin)) args.push("--ffmpeg-location", dirname(ffmpegBin));
  if (maxSeconds && Number.isFinite(maxSeconds) && maxSeconds > 0) {
    args.push("--download-sections", `*0:00-${maxSeconds}`);
  }
  args.push(url);

  const { stderr } = await execFileAsync(ytdlpPath(), args, {
    timeout: 60 * 60 * 1000,
    maxBuffer: 1024 * 1024,
  });

  for (const ext of [".mp4", ".mkv", ".webm"]) {
    const candidate = out.replace(".%(ext)s", ext);
    if (existsSync(candidate)) return candidate;
  }
  const detail = stderr.split("\n").filter(Boolean).slice(-4).join(" | ");
  throw new ApiServiceError(500, detail || "yt-dlp no produjo salida para el video de YouTube.");
}