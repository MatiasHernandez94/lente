import "server-only";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import { generateAnalysis } from "@/lib/analysis/engine";
import type { AnalysisResult, SourceType, Sport } from "@/lib/analysis/types";
import {
  createVideo as insertVideo,
  getAnalysisForVideo,
  getVideoById,
  listVideosByUser,
  saveAnalysis,
  updateVideoStatus,
} from "@/lib/repo";
import type { VideoRow } from "@/lib/schema";

const DATA_DIR = join(process.cwd(), "data", "uploads");
const SIMULATED_PROCESS_MS = 1200;

const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm", ".mkv", ".avi"];

export interface NewVideoInput {
  userId: string;
  title: string;
  sport: Sport;
  sourceType: SourceType;
  sourceRef: string | null;
  durationSeconds: number;
  players: string[];
}

export function createPendingVideo(input: NewVideoInput): VideoRow {
  return insertVideo({
    id: randomUUID(),
    userId: input.userId,
    title: input.title,
    sport: input.sport,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    durationSeconds: input.durationSeconds,
    players: input.players,
    createdAt: new Date().toISOString(),
  });
}

export function persistUpload(buffer: Buffer, originalName: string): string {
  const extension = extname(originalName).toLowerCase();
  if (!ALLOWED_VIDEO_EXTENSIONS.includes(extension)) {
    throw new ApiServiceError(415, "Formato de video no admitido.");
  }
  if (extension === ".avi" || extension === ".mkv") {
    throw new ApiServiceError(
      415,
      "Este formato no es reproducible en navegadores. Use MP4, WebM o MOV.",
    );
  }

  mkdirSync(DATA_DIR, { recursive: true });
  const filename = `${randomUUID()}${extension}`;
  writeFileSync(join(DATA_DIR, filename), buffer);
  return filename;
}

export async function runAnalysis(videoId: string, userId: string): Promise<VideoRow> {
  const video = getVideoById(videoId);
  if (!video || video.userId !== userId) {
    throw new ApiServiceError(404, "El video no existe o no corresponde al usuario.");
  }

  if (video.status === "ready" || video.status === "analyzing") {
    throw new ApiServiceError(409, "El video ya se encuentra procesado o en proceso.");
  }

  updateVideoStatus(video.id, "analyzing");

  const startedAt = Date.now();
  let result: AnalysisResult;
  try {
result = generateAnalysis(
      video.id,
      video.sport,
      video.durationSeconds ?? 1800,
      video.players ?? [],
    );
  } finally {
    const elapsed = Date.now() - startedAt;
    const remaining = SIMULATED_PROCESS_MS - elapsed;
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }

  try {
    saveAnalysis(video.id, result, new Date().toISOString());
    updateVideoStatus(video.id, "ready");
  } catch (error) {
    const message = error instanceof ApiServiceError ? error.message : "El análisis no pudo completarse.";
    updateVideoStatus(video.id, "error", message);
    throw error;
  }

  return getVideoById(video.id) as VideoRow;
}

export interface ListItem extends VideoRow {
  analysis: { score: number; generatedAt: string } | null;
}

export function listUserVideos(userId: string): ListItem[] {
  return listVideosByUser(userId).map((video) => {
    const analysis = getAnalysisForVideo(video.id);
    return {
      ...video,
      analysis: analysis ? { score: analysis.score, generatedAt: analysis.generatedAt } : null,
    };
  });
}

export class ApiServiceError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export interface DemoExample {
  title: string;
  sport: Sport;
  sourceType: SourceType;
  sourceRef: string | null;
  durationSeconds: number;
  players: string[];
}

const DEMO_EXAMPLES: DemoExample[] = [
  {
    title: "Ejemplo — Partido completo de fútbol",
    sport: "futbol",
    sourceType: "youtube",
    sourceRef: "https://www.youtube.com/watch?v=DD2wMzJ215g",
    durationSeconds: 5400,
    players: ["Delantero", "Mediocampista", "Defensa", "Portero"],
  },
  {
    title: "Ejemplo — Punto largo de pádel",
    sport: "padel",
    sourceType: "youtube",
    sourceRef: "https://www.youtube.com/watch?v=d20GkDVF4cI",
    durationSeconds: 3600,
    players: ["Zona de red", "Zona de fondo"],
  },
  {
    title: "Ejemplo — Final mundial de voleibol",
    sport: "voleibol",
    sourceType: "youtube",
    sourceRef: "https://www.youtube.com/watch?v=g87mJBmS8yk",
    durationSeconds: 7200,
    players: ["Colocador", "Atacante", "Líbero"],
  },
  {
    title: "Ejemplo — Final olímpica de baloncesto",
    sport: "baloncesto",
    sourceType: "youtube",
    sourceRef: "https://www.youtube.com/watch?v=uJs693eNfuQ",
    durationSeconds: 4800,
    players: ["Base", "Escolta", "Alero", "Pívot"],
  },
];

export function createDemoExamples(userId: string): VideoRow[] {
  return DEMO_EXAMPLES.map((example) => {
    const video = createPendingVideo({
      userId,
      title: example.title,
      sport: example.sport,
      sourceType: example.sourceType,
      sourceRef: example.sourceRef,
      durationSeconds: example.durationSeconds,
      players: example.players,
    });

    try {
      const result = generateAnalysis(video.id, video.sport, video.durationSeconds ?? 1800, example.players);
      saveAnalysis(video.id, result, new Date().toISOString());
      updateVideoStatus(video.id, "ready");
    } catch (error) {
      updateVideoStatus(video.id, "error", "El ejemplo no pudo procesarse.");
      throw error;
    }
    return getVideoById(video.id) as VideoRow;
  });
}