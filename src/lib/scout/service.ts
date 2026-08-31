import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { VideoRow } from "@/lib/schema";
import {
  getScoutAnalysis,
  saveScoutCalibration,
  saveScoutPlayers,
  saveScoutResult,
  updateScoutStatus,
} from "@/lib/repo";
import type {
  ScoutAssignment,
  ScoutCalibration,
  ScoutPlayerMetrics,
  ScoutResultData,
  ScoutStatus,
} from "@/lib/scout/types";
import { makeCalibration, computePlayerMetrics } from "@/lib/scout/geom";
import { ApiServiceError } from "@/lib/services/videoService";
import { getSignedVideoUrl } from "@/lib/storage";

const execFileAsync = promisify(execFile);
const ANALYZE_SCRIPT = join(process.cwd(), "scripts", "scout", "analyze.mjs");
const ANALYSIS_FPS = 5;

const RUN_LOCAL = process.env.LENTE_RUN_SCOUT_LOCAL === "1";

export async function startScout(video: VideoRow): Promise<void> {
  const current = await getScoutAnalysis(video.id);
  if (current?.status === "running" || current?.status === "ready") {
    throw new ApiServiceError(409, "El seguimiento ya está en proceso o fue completado.");
  }
  await updateScoutStatus(video.id, "running");

  if (RUN_LOCAL) {
    await void runScoutPipeline(video);
  }
}

async function runScoutPipeline(video: VideoRow): Promise<void> {
  if (!video.sourceRef) {
    await updateScoutStatus(video.id, "error", "El video no tiene archivo fuente.");
    return;
  }
  const signedUrl = await getSignedVideoUrl(video.sourceRef);
  if (!signedUrl) {
    await updateScoutStatus(video.id, "error", "No se pudo acceder al video.");
    return;
  }
  const localVideo = await downloadVideo(signedUrl, video.id);
  if (!localVideo) {
    await updateScoutStatus(video.id, "error", "No se pudo descargar el video.");
    return;
  }
  const outFile = join(tmpdir(), `scout-${video.id}-${randomUUID()}.json`);
  try {
    await execFileAsync(
      process.execPath,
      [ANALYZE_SCRIPT, localVideo, outFile, `fps=${ANALYSIS_FPS}`, "width=960"],
      { timeout: 60000 * 30 },
    );
    const data = JSON.parse(readFileSync(outFile, "utf8")) as ScoutResultData;
    await saveScoutResult(video.id, data);
  } catch (error) {
    await updateScoutStatus(
      video.id,
      "error",
      error instanceof Error ? error.message : "El seguimiento no pudo completarse.",
    );
  }
}

async function downloadVideo(url: string, videoId: string): Promise<string | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const localPath = join(tmpdir(), `scout-${videoId}-${randomUUID()}.mp4`);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(localPath, buf);
  return localPath;
}


export async function getScoutData(video: VideoRow): Promise<ScoutResultData | null> {
  const row = await getScoutAnalysis(video.id);
  return row?.status === "ready" && row.tracksJson ? (JSON.parse(row.tracksJson) as ScoutResultData) : null;
}

export async function getScoutStatus(video: VideoRow): Promise<ScoutStatus> {
  return ((await getScoutAnalysis(video.id))?.status ?? "none") as ScoutStatus;
}

export async function saveCalibration(
  video: VideoRow,
  input: { points: { x: number; y: number }[]; court: { width: number; height: number } },
): Promise<ScoutCalibration> {
  if (!Array.isArray(input.points) || input.points.length !== 4) {
    throw new ApiServiceError(400, "La calibración requiere 4 puntos de la cancha.");
  }
  for (const point of input.points) {
    if (
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < 0 ||
      point.x > 1 ||
      point.y < 0 ||
      point.y > 1
    ) {
      throw new ApiServiceError(400, "Cada punto debe estar dentro del video (coordenadas 0–1).");
    }
  }
  if (!input.court || input.court.width <= 0 || input.court.height <= 0) {
    throw new ApiServiceError(400, "El tamaño de la cancha en metros es inválido.");
  }
  const calibration = makeCalibration(input.points, input.court);
  const row = await getScoutAnalysis(video.id);
  if (!row) {
    throw new ApiServiceError(409, "Primero inicie el análisis de seguimiento.");
  }
  await saveScoutCalibration(video.id, calibration);
  return calibration;
}

export async function savePlayerAssignment(
  video: VideoRow,
  input: ScoutAssignment,
): Promise<ScoutAssignment> {
  if (!Number.isInteger(input.trackId) || input.trackId < 0) {
    throw new ApiServiceError(400, "Identificador de trayectoria inválido.");
  }
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 60) {
    throw new ApiServiceError(400, "Ingrese un nombre para el jugador (máximo 60 caracteres).");
  }
  if (input.team !== "A" && input.team !== "B") {
    throw new ApiServiceError(400, "El equipo debe ser A o B.");
  }

  const data = await getScoutData(video);
  if (!data) {
    throw new ApiServiceError(409, "El seguimiento aún no está listo.");
  }
  if (!data.tracks.some((track) => track.id === input.trackId)) {
    throw new ApiServiceError(404, "La trayectoria seleccionada no existe.");
  }

  const row = await getScoutAnalysis(video.id);
  const players: ScoutAssignment[] = row?.playersJson ? (JSON.parse(row.playersJson) as ScoutAssignment[]) : [];
  const assignment: ScoutAssignment = { trackId: input.trackId, name, team: input.team };
  const next = [...players.filter((player) => player.trackId !== input.trackId), assignment];
  await saveScoutPlayers(video.id, next);
  return assignment;
}

export async function listScoutAssignments(video: VideoRow): Promise<ScoutAssignment[]> {
  const row = await getScoutAnalysis(video.id);
  if (!row?.playersJson) return [];
  return JSON.parse(row.playersJson) as ScoutAssignment[];
}

export async function getScoutCalibration(video: VideoRow): Promise<ScoutCalibration | null> {
  const row = await getScoutAnalysis(video.id);
  if (!row?.calibrationJson) return null;
  return JSON.parse(row.calibrationJson) as ScoutCalibration;
}

export async function scoutPlayerMetrics(video: VideoRow): Promise<ScoutPlayerMetrics[]> {
  const data = await getScoutData(video);
  const assignments = await listScoutAssignments(video);
  const calibration = await getScoutCalibration(video);
  if (!data || assignments.length === 0 || !calibration) return [];

  return assignments
    .map((assignment) => {
      const track = data.tracks.find((track) => track.id === assignment.trackId);
      if (!track) return null;
      return computePlayerMetrics(track, assignment.name, assignment.team, calibration, data.analysis.fps);
    })
    .filter((metric): metric is ScoutPlayerMetrics => metric !== null);
}