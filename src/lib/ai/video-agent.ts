import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { VideoRow } from "@/lib/schema";
import type { Sport } from "@/lib/analysis/types";
import { updateVideo } from "@/lib/repo";
import { extractVideoFrames, type ExtractedFrame } from "./frames";
import { AIQuotaError, type AIProvider, type AuditContext, type AuditVerdict } from "./providers/types";
import { getAIProviderRouter } from "./providers/router";
import type { ImprovementsResult } from "./providers/types";
import { downloadVideoFromStorage, readAnalysisFromStorage, saveAnalysisToStorage } from "@/lib/videos/storage";
import { downloadYouTubeVideo } from "@/lib/videos/youtube";
import { buildCoachTimeline } from "./coach";
import { sportKnowledgeBlock } from "@/lib/sports/domain";
import { auditAnalysis, formatAuditCompact, type AuditResult } from "@/lib/analysis/audit";
import { formatLearningsForPrompt, getRelevantLearnings, saveUserFeedback } from "@/lib/coach/learnings";
import { sendAlert } from "@/lib/alerts";

const UPLOADS_DIR = join(process.cwd(), "data", "uploads");
const AI_RESULTS_DIR = join(process.cwd(), "data", "sports-analysis");
export const AI_INSIGHT_FILE = (videoId: string) => join(AI_RESULTS_DIR, `${videoId}.ai.json`);

// ── Configuración de visión ──
// Los cuatro momentos del video viajan como un mosaico de celdas de este ancho.
// Con 384px el mosaico completo queda en 768×768 (un tile de Gemini), así que el
// costo de visión es el de UNA imagen en lugar de cuatro. Si algún análisis
// necesita más detalle postural, se sube el ancho de celda por entorno.
const AI_FRAME_COUNT = 4;
const AI_FRAME_CELL_WIDTH = Number(process.env.LENTE_AI_FRAME_WIDTH ?? 384);

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
 * Extrae fotogramas para IA.
 *
 * En local usa el archivo de data/uploads; en entornos sin el archivo devuelve
 * error para que la UI explique por qué no se pudo.
 *
 * Los cuatro momentos del video viajan como UN mosaico 2×2 en lugar de cuatro
 * imágenes sueltas. El ahorro real no es de overhead (los tokens de visión se
 * cobran por píxeles) sino de resolución total: el mosaico permite achicar cada
 * celda manteniendo los cuatro momentos, bajando el costo de visión unas 4x.
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
    const frames = await extractVideoFrames(videoPath, {
      count: AI_FRAME_COUNT,
      gridCellWidth: AI_FRAME_CELL_WIDTH,
    });
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

  const solo = analysis.solo as
    | {
        intensity?: { level?: string; score?: number };
        rhythm?: {
          rhythm_detected?: boolean;
          frequency_rpm?: number;
          consistency?: number;
          oscillation_amplitude_m?: number;
        };
        repetitions?: { repetitions_detected?: boolean; count?: number; frequency_rpm?: number };
        movement?: { pattern?: string };
        detailed?: Record<string, unknown>;
        narrative?: string;
      }
    | undefined;
  if (typeof solo?.intensity?.score === "number") {
    metrics.push({ label: "Intensidad", value: String(Math.round(solo.intensity.score)), unit: "/100" });
  }
  if (typeof solo?.intensity?.level === "string") {
    metrics.push({ label: "Nivel de intensidad", value: solo.intensity.level.replace("_", " "), unit: "" });
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

  // ── Contexto del deporte y de la escena ──
  // El deporte declarado es el contexto que el usuario eligió: define qué
  // métricas tienen sentido. Un video de saltar la cuerda no se evalúa con
  // posesión ni formaciones, y el modelo necesita que le digamos eso.
  const declaredSport = typeof analysis.sport === "string" ? analysis.sport : video.sport;
  const sportMetrics = analysis.sport_metrics as
    | Record<string, unknown>
    | null
    | undefined;
  if (sportMetrics) {
    for (const [key, value] of Object.entries(sportMetrics)) {
      if (value == null || typeof value === "object" || key === "player_label") continue;
      const label = key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      metrics.push({ label, value: String(value), unit: "" });
    }
  }
  const scale = analysis.scale as
    | { meters_per_pixel?: number; reference_person_m?: number; confidence?: string; method?: string }
    | null
    | undefined;
  if (scale?.meters_per_pixel) {
    metrics.push({
      label: "Escala de calibración",
      value: `${scale.meters_per_pixel.toFixed(5)} m/pixel (altura de persona ${scale.reference_person_m ?? 1.7} m)`,
      unit: "",
    });
    if (scale.confidence === "approx") {
      limitations.push(
        "La escala se derivó de la altura aparente del sujeto y es aproximada: las distancias y velocidades tienen margen de error, no las trates como exactas.",
      );
    }
  }

  // Señales de actividad individual profundizadas (tendencia, descansos,
  // ratio trabajo/descanso). Son la diferencia entre "intensidad 64/100" y
  // "sostiene el ritmo los primeros 3 minutos y decae un 40% al final".
  if (solo?.rhythm?.rhythm_detected) {
    metrics.push({
      label: "Ritmo del ejercicio",
      value: `${Math.round(solo.rhythm.frequency_rpm ?? 0)} RPM`,
      unit: "repeticiones por minuto",
    });
    if (solo.rhythm.oscillation_amplitude_m != null) {
      metrics.push({
        label: "Amplitud del movimiento",
        value: `${(solo.rhythm.oscillation_amplitude_m * 100).toFixed(0)} cm`,
        unit: "",
      });
    }
    if (solo.rhythm.consistency != null) {
      metrics.push({
        label: "Consistencia del ritmo",
        value: `${Math.round(solo.rhythm.consistency * 100)}%`,
        unit: "",
      });
    }
  }
  if (solo?.repetitions?.repetitions_detected) {
    metrics.push({
      label: "Repeticiones detectadas",
      value: String(solo.repetitions.count),
      unit: "",
    });
  }
  const detailed = solo?.detailed;
  if (detailed) {
    const trend = detailed.intensity_trend as string | undefined;
    const change = detailed.intensity_change_pct as number | undefined;
    if (trend && change != null) {
      metrics.push({
        label: "Tendencia de intensidad",
        value: `${trend} (${change > 0 ? "+" : ""}${change.toFixed(0)}%)`,
        unit: "inicio vs final",
      });
    }
    if (typeof detailed.rest_periods === "number" && detailed.rest_periods > 0) {
      metrics.push({
        label: "Pausas de descanso",
        value: String(detailed.rest_periods),
        unit: `de ${(detailed.avg_rest_s as number)?.toFixed?.(1) ?? "?"}s promedio`,
      });
      if (detailed.work_rest_ratio != null) {
        metrics.push({
          label: "Ratio trabajo/descanso",
          value: String(detailed.work_rest_ratio),
          unit: "",
        });
      }
    }
  }
  if (solo?.movement?.pattern) {
    metrics.push({ label: "Patrón de movimiento", value: solo.movement.pattern, unit: "" });
  }
  if (typeof analysis.sport_narrative === "string") {
    metrics.push({ label: "Resumen del pipeline", value: analysis.sport_narrative, unit: "" });
  }

  // Deporte declarado en lenguaje natural, para que el modelo deje de aplicar
  // plantillas de fútbol a un video de gimnasio.
  const SPORT_CONTEXT: Record<string, string> = {
    general: "actividad individual (ejercicio, fitness, técnica personal). No aplican posesión, formaciones ni tácticas de equipo.",
    futbol: "fútbol. Aplican posesión, formaciones, presión y transiciones.",
    padel: "pádel. Aplican red vs fondo, errores no forzados y smash.",
    voleibol: "voleibol. Aplican remate, bloqueo, recepción y saque.",
    baloncesto: "baloncesto. Aplican botes, tiro, rebote y transiciones.",
  };
  const sportNote = SPORT_CONTEXT[declaredSport];
  if (sportNote) {
    limitations.push(`Deporte declarado: ${declaredSport}. Contexto: ${sportNote}`);
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

  // Ruido de identidad: el tracker filtra tracks fantasma y artefactos
  // estáticos, así que el conteo ya es de personas reales. Si aún quedaran
  // muchas trazas, se avisa para que el modelo use métricas relativas.
  const totalTracks = tracking?.summary?.total_players_detected ?? 0;
  const rawTracks = (tracking?.summary as { raw_tracks_detected?: number } | undefined)?.raw_tracks_detected ?? totalTracks;
  const ghosts = (tracking?.summary as { ghost_tracks_filtered?: number } | undefined)?.ghost_tracks_filtered ?? 0;
  if (ghosts > 0) {
    limitations.push(
      `El tracker descartó ${ghosts} trazas de ruido (arteofactos estáticos y detecciones de 1-2 frames) de ${rawTracks} brutas. El conteo de ${totalTracks} es de personas reales en escena, no de frames.`,
    );
  }
  if (analysis.mode === "team" && totalTracks > 12) {
    limitations.push(
      `Se detectaron ${totalTracks} trazas. En baloncesto o deportes de cancha, el número absoluto suele exagerarse por re-tracking; priorizá métricas relativas (por equipo, posesión) antes de tomarlo como "jugadores".`,
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

/**
 * Pasada 1: auditoría determinista + clasificación del error + selección de la
 * corrección más crítica.
 *
 * La auditoría (paso 2) se resuelve sin IA. El modelo solo juzga (pasos 3 y 4) y
 * lo hace con la auditoría como ground truth. El veredicto se guarda junto al
 * análisis y la pasada 2 (informe del coach) lo recibe, así no re-razona desde
 * cero ni se contradice.
 */
export async function runMotorAudit(
  video: VideoRow,
  analysis: Record<string, unknown> | null,
): Promise<AuditVerdict & { provider: string; audit: AuditResult }> {
  const { frames } = await extractFramesForAI(video);
  const { metrics, limitations } = summarizeAnalysisForAgent(video, analysis ?? {});

  const mode = String(analysis?.mode ?? "solo") === "team" ? "team" : "solo";
  const declaredSport = (analysis?.sport === "general" ? video.sport : (analysis?.sport as Sport)) ?? video.sport;

  const audit = auditAnalysis({
    sport: declaredSport,
    mode,
    solo: (analysis?.solo as Record<string, unknown>) ?? null,
    sport_metrics: (analysis?.sport_metrics as Record<string, unknown>) ?? null,
    tracking: (analysis?.tracking as { summary?: Record<string, unknown> }) ?? null,
    duration_s: Number((analysis?.video as { duration_s?: number } | undefined)?.duration_s ?? 0),
  });

  // Memoria dinámica. Si falla la lectura, el análisis sigue sin ella: es una
  // mejora, no una dependencia.
  const learnings = await getRelevantLearnings(declaredSport, null, video.userId);
  const learningsBlock = formatLearningsForPrompt(learnings);

  const ctx: AuditContext = {
    videoTitle: video.title,
    sport: declaredSport,
    mode,
    metrics,
    auditBlock: formatAuditCompact(audit),
    limitations,
    knowledgeBlock: sportKnowledgeBlock(declaredSport),
    // Memoria dinámica: aprendizajes de este deporte. Se buscan DESPUÉS de la
    // auditoría porque el tipo de falla todavía no se conoce, así que se
    // recuperan por deporte y el modelo decide cuáles aplican.
    learningsBlock: learningsBlock,
    frames: frames.map((f) => ({ base64: f.base64, mimeType: f.mimeType, timeSeconds: f.timeSeconds })),
  };

  const { result, provider } = await withRouter((p) => p.auditAnalysis(ctx));
  return { ...result, provider, audit };
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
  audit?: AuditVerdict | null,
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
    // El informe ya no arranca de cero: recibe el veredicto de la pasada 1 y lo
    // desarrolla. Si no hay veredicto (falló la pasada 1), sigue como antes.
    audit: audit
      ? {
          error_type: audit.error_type,
          based_on: audit.based_on,
          critical_fix: audit.critical_fix,
          discarded: audit.discarded,
          time_s: audit.time_s,
          confidence: audit.confidence,
        }
      : null,
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
  kind: "sport_detection" | "improvements" | "coach_report" | "coach_chat" | "motor_audit",
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
  motor_audit?: Record<string, unknown>;
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
export { saveUserFeedback };
