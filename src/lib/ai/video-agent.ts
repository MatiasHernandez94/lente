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
import { buildCoachTimeline } from "./coach";
import { sendAlert } from "@/lib/alerts";

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
    const frames = await extractVideoFrames(videoPath, { count: 4, maxWidth: 512 });
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
    const teams = tracking.summary.teams;
    if (teams && (teams.team_0 ?? 0) > 0 && (teams.team_1 ?? 0) > 0) {
      metrics.push({ label: "Conteo por equipo", value: `${teams.team_0} vs ${teams.team_1}`, unit: "trazas" });
    }
  }
  const tactical = analysis.tactical as { formations?: Record<string, { formation?: string }>; possession?: Record<string, number>; pressing?: Record<string, unknown>; transitions?: { total?: number } } | undefined;
  if (tactical?.formations?.team_0?.formation) {
    metrics.push({
      label: "Formación equipo A",
      value: tactical.formations.team_0.formation,
      unit: "",
    });
  }
  if (tactical?.formations?.team_1?.formation) {
    metrics.push({
      label: "Formación equipo B",
      value: tactical.formations.team_1.formation,
      unit: "",
    });
  }
  const possession0 = tactical?.possession?.team_0;
  const possession1 = tactical?.possession?.team_1;
  if (typeof possession0 === "number" && typeof possession1 === "number") {
    metrics.push({
      label: "Posesión",
      value: `${possession0.toFixed(1)}% / ${possession1.toFixed(1)}%`,
      unit: "equipo A/B",
    });
  }
  if (typeof tactical?.transitions?.total === "number" && tactical.transitions.total > 0) {
    metrics.push({ label: "Transiciones", value: String(tactical.transitions.total), unit: "eventos" });
  }
  if (tactical?.pressing) {
    for (const [team, data] of Object.entries(tactical.pressing)) {
      if (typeof data !== "object" || data === null) continue;
      const attempts = (data as Record<string, unknown>).attempts ?? (data as Record<string, unknown>).count;
      if (typeof attempts === "number") {
        metrics.push({ label: `Presión ${team === "team_0" ? "equipo A" : "equipo B"}`, value: String(attempts), unit: "intentos" });
      }
    }
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

  // Métricas y limitaciones específicas del deporte (ej. básquet: botes,
  // jugador con más posesión, canasta no detectada). Antes se descartaban y el
  // modelo razonaba sin los números que el pipeline sí calculó.
  const sportSpecific = analysis.sport_specific as
    | { sport?: string; metrics?: Array<{ metric?: string; value?: number | string | null; unit?: string | null }>; limitations?: string[] }
    | null
    | undefined;
  if (sportSpecific?.metrics) {
    for (const m of sportSpecific.metrics) {
      const label = m.metric ? m.metric.replace(/_/g, " ") : "";
      if (!label || m.value == null) continue;
      metrics.push({
        label: label.charAt(0).toUpperCase() + label.slice(1),
        value: String(m.value),
        unit: m.unit ?? "",
      });
    }
  }
  if (Array.isArray(sportSpecific?.limitations)) {
    for (const limitation of sportSpecific.limitations) {
      if (typeof limitation === "string" && limitation.trim()) {
        limitations.push(limitation);
      }
    }
  }

  // Desgaste físico / riesgo (fatiga) para que el modelo priorice alertas.
  const fatigue = analysis.fatigue as { summary?: { fatigued_players?: number; total_injury_risks?: number; high_severity_risks?: number } } | undefined;
  if (fatigue?.summary) {
    if (typeof fatigue.summary.fatigued_players === "number" && fatigue.summary.fatigued_players > 0) {
      metrics.push({ label: "Jugadores fatigados", value: String(fatigue.summary.fatigued_players), unit: "jugadores" });
    }
    if (typeof fatigue.summary.total_injury_risks === "number" && fatigue.summary.total_injury_risks > 0) {
      metrics.push({ label: "Riesgos de lesión", value: String(fatigue.summary.total_injury_risks), unit: "eventos" });
    }
    if (typeof fatigue.summary.high_severity_risks === "number" && fatigue.summary.high_severity_risks > 0) {
      limitations.push(
        `${fatigue.summary.high_severity_risks} riesgo(s) de lesión de severidad alta detectados: priorizá comunicar el desgaste antes que las mejoras tácticas.`,
      );
    }
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

  // Ruido de identidad: sin re-identificación, un jugador real genera muchas
  // trazas cortas. Ayuda al modelo a no tratar "1339 jugadores" como literal.
  const totalTracks = tracking?.summary?.total_players_detected ?? 0;
  if (analysis.mode === "team" && totalTracks > 40) {
    limitations.push(
      `Se detectaron ${totalTracks} trazas cortas (sin re-identificación por dorsal). Representan ~${Math.min(10, totalTracks)} jugadores reales por momento; usá métricas relativas, no el conteo absoluto.`,
    );
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

export interface CoachReportVisionResult {
  summary: string;
  positives: Array<{ title: string; detail: string; time_s: number | null }>;
  improvements: Array<{ title: string; detail: string; time_s: number | null }>;
  /** Plan de corrección: cues/ejercicios accionables (opcional). */
  plan?: Array<{ title: string; detail: string }>;
  provider: string;
}

/**
 * Genera un informe táctico de coach con datos del análisis y fotogramas.
 * Cada observación referencia un segundo del video (o null si es general).
 */
export async function generateCoachReportWithVision(
  video: VideoRow,
  analysis: Record<string, unknown> | null,
): Promise<CoachReportVisionResult> {
  const { frames } = await extractFramesForAI(video);
  const { metrics, limitations } = summarizeAnalysisForAgent(video, analysis ?? {});
  const timeline = buildCoachTimeline(analysis ?? {});

  const ctx = {
    videoTitle: video.title,
    sport: analysis?.sport === "general" ? video.sport : ((analysis?.sport as Sport) ?? video.sport),
    mode: String(analysis?.mode ?? "solo"),
    durationSeconds: video.durationSeconds,
    metrics,
    timeline,
    limitations,
    frames: frames.map((f) => ({
      base64: f.base64,
      mimeType: f.mimeType,
      timeSeconds: f.timeSeconds,
    })),
  };

  try {
    const { result, provider } = await withRouter((p) => p.generateCoachReport(ctx));
    return { ...result, provider };
  } catch (error) {
    throw mapAIError(error);
  }
}

/** Chat del coach con IA real usando análisis + informe generado. */
export async function generateCoachChatAnswer(
  video: VideoRow,
  analysis: Record<string, unknown> | null,
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  report: CoachReportVisionResult | null,
): Promise<string> {
  const { metrics, limitations } = summarizeAnalysisForAgent(video, analysis ?? {});
  const timeline = buildCoachTimeline(analysis ?? {});

  const ctx = {
    videoTitle: video.title,
    sport: analysis?.sport === "general" ? video.sport : ((analysis?.sport as Sport) ?? video.sport),
    mode: String(analysis?.mode ?? "solo"),
    durationSeconds: video.durationSeconds,
    metrics,
    timeline,
    limitations,
    report: report
      ? {
          summary: report.summary,
          positives: report.positives,
          improvements: report.improvements,
          plan: report.plan,
        }
      : null,
    history,
    message,
  };

  try {
    const { result } = await withRouter((p) => p.coachChat(ctx));
    return result;
  } catch (error) {
    throw mapAIError(error);
  }
}

/** Persiste un resultado de IA junto al análisis deportivo (local + Storage). */
export async function saveVideoAIInsight(
  videoId: string,
  kind: "sport_detection" | "improvements" | "coach_report" | "coach_chat",
  payload: Record<string, unknown>,
): Promise<void> {
  const existing = await getVideoAIInsight(videoId).catch(() => null);
  const merged: Record<string, unknown> = {
    ...(existing ?? {}),
    [kind]: payload,
    updated_at: new Date().toISOString(),
  };

  // El espejo en Storage es lo único que Vercel (otro filesystem) puede leer:
  // si falla, el job queda "done" y el usuario ve "sin análisis".
  if (!(await saveAnalysisToStorage(`${videoId}.ai.json`, merged))) {
    console.error("saveVideoAIInsight: no se pudo guardar el espejo en Storage");
    await sendAlert({
      level: "error",
      title: "No se guardó el resultado del análisis de IA",
      message: "El espejo en Storage falló; el video mostraría resultados vacíos.",
      data: { videoId, insight: kind },
    });
  }

  try {
    if (!existsSync(AI_RESULTS_DIR)) {
      mkdirSync(AI_RESULTS_DIR, { recursive: true });
    }
    writeFileSync(AI_INSIGHT_FILE(videoId), JSON.stringify(merged, null, 2));
  } catch (error) {
    console.error("saveVideoAIInsight:", error);
  }
}

export interface CoachChatRecord {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  at: string;
}

/** Lee la conversación persistida del coach para un video (local + Storage). */
export async function getCoachConversation(
  videoId: string,
): Promise<CoachChatRecord | null> {
  const insight = await getVideoAIInsight(videoId).catch(() => null);
  const record = insight?.coach_chat as Partial<CoachChatRecord> | undefined;
  if (!record || !Array.isArray(record.messages)) return null;
  return {
    messages: record.messages
      .map((m) => ({
        role: m?.role === "assistant" ? "assistant" as const : "user" as const,
        content: String(m?.content ?? ""),
      }))
      .filter((m) => m.content.trim() !== ""),
    at: String(record.at ?? ""),
  };
}

/** Persiste la conversación del coach de un video (local + Storage). */
export async function saveCoachConversation(
  videoId: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<void> {
  const capped = messages.slice(-60);
  await saveVideoAIInsight(videoId, "coach_chat", {
    messages: capped,
    at: new Date().toISOString(),
  });
}

type VideoAIInsight = {
  sport_detection?: Record<string, unknown>;
  improvements?: Record<string, unknown>;
  coach_report?: Record<string, unknown>;
  coach_chat?: Record<string, unknown>;
};

/** Lee los insights de IA guardados para un video (local + Storage). */
export async function getVideoAIInsight(
  videoId: string,
): Promise<VideoAIInsight | null> {
  try {
    const filePath = AI_INSIGHT_FILE(videoId);
    if (existsSync(filePath)) {
      const local = safeParseJson<VideoAIInsight>(readFileSync(filePath, "utf8"));
      if (local) return local;
    }
  } catch {
    // fallthrough a Storage
  }

  const stored = await readAnalysisFromStorage<VideoAIInsight>(`${videoId}.ai.json`);
  return stored;
}

function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}