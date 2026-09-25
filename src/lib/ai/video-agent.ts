import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { VideoRow } from "@/lib/schema";
import type { Sport } from "@/lib/analysis/types";
import { updateVideo } from "@/lib/repo";
import { extractVideoFrames, type ExtractedFrame } from "./frames";
import { AIQuotaError, type AIProvider } from "./providers/types";
import { getAIProviderRouter } from "./providers/router";
import type { ImprovementsResult } from "./providers/types";
import { downloadVideoFromStorage, readAnalysisFromStorage, saveAnalysisToStorage } from "@/lib/videos/storage";
import { downloadYouTubeVideo } from "@/lib/videos/youtube";

const UPLOADS_DIR = join(process.cwd(), "data", "uploads");
const AI_RESULTS_DIR = join(process.cwd(), "data", "sports-analysis");
export const AI_INSIGHT_FILE = (videoId: string) => join(AI_RESULTS_DIR, `${videoId}.ai.json`);

export type AIActionErrorKind = "no_keys" | "quota" | "video_unavailable" | "frames_unavailable";

export class AIActionError extends Error {
  readonly kind: AIActionErrorKind;
  readonly detail?: string;

  constructor(kind: AIActionErrorKind, message: string, detail?: string) {
    super(message);
    this.name = "AIActionError";
    this.kind = kind;
    this.detail = detail;
  }
}

export interface SportVisionResult {
  sport: Sport;
  confidence: number;
  reason: string;
  provider: string;
}

/** Obtiene la ruta local del video (descargándolo de Storage o YouTube si hace falta). */
async function resolveLocalVideo(video: VideoRow): Promise<string | null> {
  const ref = video.sourceRef;
  if (!ref) return null;
  if (video.sourceType === "youtube") {
    try {
      return await downloadYouTubeVideo(ref, video.id, 60);
    } catch {
      return null;
    }
  }
  const filePath = join(UPLOADS_DIR, ref);
  if (existsSync(filePath)) return filePath;

  // Producción: el archivo vive en Supabase Storage → lo descargamos a tmp.
  const buffer = await downloadVideoFromStorage(ref);
  if (!buffer) return null;
  const tmpFile = join(tmpdir(), `lente-${randomUUID()}-${ref}`);
  writeFileSync(tmpFile, buffer);
  return tmpFile;
}

interface FramesResult {
  frames: ExtractedFrame[];
  playerCount: number;
}

/**
 * Extrae fotogramas para IA. En local usa el archivo de data/uploads; en
 * entornos sin el archivo devuelve error para que la UI explique por qué no se pudo.
 */
async function extractFramesForAI(video: VideoRow): Promise<FramesResult> {
  const videoPath = await resolveLocalVideo(video);
  if (!videoPath) {
    throw new AIActionError(
      "video_unavailable",
      "No se pudo analizar el video con IA: el archivo del video no está disponible en este entorno. En producción los videos se analizan donde está almacenado el archivo.",
    );
  }
  try {
    const frames = await extractVideoFrames(videoPath, { count: 4, maxWidth: 640 });
    if (frames.length === 0) {
      throw new AIActionError(
        "frames_unavailable",
        "No se pudieron extraer fotogramas para el análisis con IA. Asegurate de que el video tenga contenido válido.",
      );
    }
    return { frames, playerCount: 0 };
  } catch (error) {
    if (error instanceof AIActionError) throw error;
    throw new AIActionError(
      "frames_unavailable",
      `No se pudieron extraer fotogramas: ${error instanceof Error ? error.message : "error desconocido"}`,
    );
  }
}

async function withRouter<T>(
  method: (provider: AIProvider) => Promise<T>,
): Promise<{ result: T; provider: string }> {
  return getAIProviderRouter().withRotation(method);
}

/**
 * Detecta el deporte por visión y actualiza `videos.sport`.
 * Si la IA no está configurada o falla, devuelve el error estructurado
 * (la UI muestra por qué no se pudo) sin romper.
 */
export async function detectSportWithVision(video: VideoRow): Promise<SportVisionResult> {
  const { frames } = await extractFramesForAI(video);

  const ctx = {
    videoTitle: video.title,
    sourceType: video.sourceType,
    durationSeconds: video.durationSeconds,
    frames: frames.map((f) => ({
      base64: f.base64,
      mimeType: f.mimeType,
      timeSeconds: f.timeSeconds,
    })),
    playerCount: 0,
    mode: "solo",
  };

  try {
    const { result, provider } = await withRouter((p) => p.detectSport(ctx));
    if (result.sport !== "general" && result.sport !== video.sport) {
      await updateVideo(video.id, { sport: result.sport });
    }
    return { ...result, provider };
  } catch (error) {
    throw mapAIError(error);
  }
}

/** Separa el detalle de la respuesta en métricas y limitaciones para el agente. */
function summarizeAnalysisForAgent(video: VideoRow, analysis: Record<string, unknown>): {
  metrics: { label: string; value: string; unit: string }[];
  limitations: string[];
} {
  const metrics: { label: string; value: string; unit: string }[] = [];
  const limitations: string[] = [];

  const tracking = analysis.tracking as { summary?: { total_players_detected?: number; teams?: Record<string, number> } } | undefined;
  if (tracking?.summary) {
    metrics.push({
      label: "Jugadores detectados",
      value: String(tracking.summary.total_players_detected ?? 0),
      unit: "jugadores",
    });
  }
  const tactical = analysis.tactical as { formations?: Record<string, { formation?: string }> } | undefined;
  if (tactical?.formations?.team_0?.formation) {
    metrics.push({
      label: "Formación equipo A",
      value: tactical.formations.team_0.formation,
      unit: "",
    });
  }
  const events = analysis.events as { total_events?: number; event_summary?: Record<string, number> } | undefined;
  if (typeof events?.total_events === "number") {
    metrics.push({ label: "Eventos deportivos", value: String(events.total_events), unit: "eventos" });
  }

  const solo = analysis.solo as { intensity?: { score?: number }; repetitions?: { count?: number } } | undefined;
  if (solo?.intensity?.score != null) {
    metrics.push({ label: "Intensidad", value: String(Math.round(solo.intensity.score)), unit: "/100" });
  }
  if (typeof solo?.repetitions?.count === "number") {
    metrics.push({ label: "Repeticiones", value: String(solo.repetitions.count), unit: "" });
  }

  // Limitaciones detectadas por el pipeline
  if (!solo && !tactical?.formations?.team_0) {
    limitations.push(
      "El análisis no pudo identificar formaciones ni eventos tácticos, probablemente por la calidad o la toma del video.",
    );
  }
  if (analysis.mode === "solo" && (!solo?.intensity?.score || solo?.intensity?.score === 0)) {
    limitations.push("No se pudo calcular la intensidad porque no hay datos suficientes de movimiento.");
  }

  return { metrics, limitations };
}

export interface ImprovementsVisionResult extends ImprovementsResult {
  provider: string;
  playerCount: number;
}

/** Genera recomendaciones de mejora con el agente IA según análisis y fotogramas. */
export async function generateImprovementsWithVision(
  video: VideoRow,
  analysis: Record<string, unknown> | null,
): Promise<ImprovementsVisionResult> {
  const { frames, playerCount } = await extractFramesForAI(video);
  const { metrics, limitations } = summarizeAnalysisForAgent(video, analysis ?? {});

  const ctx = {
    videoTitle: video.title,
    sport: analysis?.sport === "general" ? video.sport : ((analysis?.sport as Sport) ?? video.sport),
    mode: String(analysis?.mode ?? "solo"),
    metrics,
    limitations,
    frames: frames.map((f) => ({
      base64: f.base64,
      mimeType: f.mimeType,
      timeSeconds: f.timeSeconds,
    })),
  };

  try {
    const { result, provider } = await withRouter((p) => p.generateImprovements(ctx));
    return { ...result, provider, playerCount };
  } catch (error) {
    throw mapAIError(error);
  }
}

function mapAIError(error: unknown): never {
  if (error instanceof AIQuotaError) {
    const message =
      error.kind === "no_keys"
        ? error.message
        : error.kind === "all_exhausted"
          ? error.message
          : "La cuota gratuita de la IA se agotó. Se reintentará automáticamente con otra clave; si todas se agotaron, hay que configurar una clave con plan de pago.";
    throw new AIActionError(error.kind === "no_keys" ? "no_keys" : "quota", message);
  }
  if (error instanceof AIActionError) throw error;
  throw new AIActionError(
    "quota",
    "El análisis con IA falló temporalmente.",
    error instanceof Error ? error.message : "error desconocido",
  );
}

/** Persiste un resultado de IA junto al análisis deportivo (local + Storage). */
export async function saveVideoAIInsight(
  videoId: string,
  kind: "sport_detection" | "improvements",
  payload: Record<string, unknown>,
): Promise<void> {
  const existing = await getVideoAIInsight(videoId).catch(() => null);
  const merged: Record<string, unknown> = {
    ...(existing ?? {}),
    [kind]: payload,
    updated_at: new Date().toISOString(),
  };

  void saveAnalysisToStorage(`${videoId}.ai.json`, merged);

  try {
    if (!existsSync(AI_RESULTS_DIR)) {
      mkdirSync(AI_RESULTS_DIR, { recursive: true });
    }
    writeFileSync(AI_INSIGHT_FILE(videoId), JSON.stringify(merged, null, 2));
  } catch (error) {
    console.error("saveVideoAIInsight:", error);
  }
}

/** Lee los insights de IA guardados para un video (local + Storage). */
export async function getVideoAIInsight(
  videoId: string,
): Promise<{ sport_detection?: Record<string, unknown>; improvements?: Record<string, unknown> } | null> {
  try {
    const filePath = AI_INSIGHT_FILE(videoId);
    if (existsSync(filePath)) {
      const local = safeParseJson<{
        sport_detection?: Record<string, unknown>;
        improvements?: Record<string, unknown>;
      }>(readFileSync(filePath, "utf8"));
      if (local) return local;
    }
  } catch {
    // fallthrough a Storage
  }

  const stored = await readAnalysisFromStorage<{
    sport_detection?: Record<string, unknown>;
    improvements?: Record<string, unknown>;
  }>(`${videoId}.ai.json`);
  return stored;
}

function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}