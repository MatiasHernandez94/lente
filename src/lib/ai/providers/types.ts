import type { Sport } from "@/lib/analysis/types";

export interface FrameImage {
  base64: string;
  mimeType: string;
  timeSeconds: number;
  /** Presente solo si el fotograma es un mosaico de varios momentos del video. */
  gridCells?: number;
  /** Cuántos momentos reales del video entraron en el mosaico. */
  gridCoveredFrames?: number;
}

export interface PlayerSummary {
  id: number;
  distances: number[];
  avgSpeedMps: number;
  maxSpeedMps: number;
}

export interface BallObservation {
  center: [number, number];
  timeSeconds: number;
  confidence: number;
}

export interface SportContext {
  videoTitle: string;
  sourceType: string;
  durationSeconds: number | null;
  frames: FrameImage[];
  playerCount: number;
  mode: string;
}

export interface SportDetectionResult {
  sport: Sport;
  confidence: number;
  reason: string;
}

export interface MetricResult {
  metric: string;
  value: number | string | null;
  unit: string;
  confidence: number;
  computed: boolean;
  reason?: string;
}

export interface ImprovementItem {
  title: string;
  detail: string;
  priority: "alta" | "media" | "baja";
  referenceToMetric?: string;
}

export interface ImprovementsContext {
  videoTitle: string;
  sport: Sport;
  mode: string;
  metrics: { label: string; value: string; unit: string }[];
  limitations: string[];
  frames: FrameImage[];
}

export interface ImprovementsResult {
  summary: string;
  improvements: ImprovementItem[];
}

export interface CoachReportPoint {
  title: string;
  detail: string;
  time_s: number | null;
}

export interface CoachReportDrill {
  title: string;
  detail: string;
}

export interface CoachReportResult {
  summary: string;
  positives: CoachReportPoint[];
  improvements: CoachReportPoint[];
  /** Plan de corrección: cues/ejercicios accionables (opcional). */
  plan?: CoachReportDrill[];
}

export interface CoachContext {
  videoTitle: string;
  sport: Sport;
  mode: string;
  durationSeconds: number | null;
  metrics: { label: string; value: string; unit: string }[];
  timeline: string;
  limitations: string[];
  frames: FrameImage[];
  /**
   * Veredicto de la pasada 1 (clasificación del error + corrección elegida).
   * El informe lo desarrolla en vez de re-razonarlo, para no contradecirlo.
   */
  audit?: AuditVerdict | null;
}

export interface CoachChatContext {
  videoTitle: string;
  sport: Sport;
  mode: string;
  durationSeconds: number | null;
  metrics: { label: string; value: string; unit: string }[];
  timeline: string;
  limitations: string[];
  report: CoachReportResult | null;
  history: { role: "user" | "assistant"; content: string }[];
  message: string;
}

// ── Pasos 3 y 4: clasificar el error y elegir la corrección más crítica ──

/** Tipo de falla identificada. */
export type ErrorType = "postural" | "timing" | "espacial" | "tactico" | "condicion_fisica" | "ninguno";

/**
 * Veredicto de la pasada 1 (auditoría + clasificación + selección).
 *
 * Se guarda junto al análisis y se le pasa a la pasada 2 (informe del coach)
 * como ground truth, para que el informe no repita el razonamiento desde cero
 * ni contradiga lo que ya se decidió.
 */
export interface AuditVerdict {
  /** Paso 3: qué tipo de falla es. */
  error_type: ErrorType;
  /** En qué métrica o hallazgo se basa. */
  based_on: string;
  /** Paso 4: la corrección más crítica, una sola. */
  critical_fix: {
    title: string;
    detail: string;
    cue: string;
  };
  /** Alternativas que se evaluaron y se descartaron (con el porqué). */
  discarded: Array<{ option: string; why_discarded: string }>;
  /** Segundo del video donde se ve el problema, si aplica. */
  time_s: number | null;
  /** Confianza del veredicto, alineada con la auditoría determinista. */
  confidence: "alta" | "media" | "baja";
}

export interface AuditContext {
  videoTitle: string;
  sport: Sport;
  mode: string;
  metrics: { label: string; value: string; unit: string }[];
  /** Resultado de la auditoría determinista, ya formateado para el prompt. */
  auditBlock: string;
  limitations: string[];
  /** Conocimiento curado del deporte (errores típicos y cues). */
  knowledgeBlock: string;
  /**
   * Memoria dinámica: aprendizajes recuperados de análisis anteriores.
   * Vacío cuando no hay nada aplicable (la sección no se manda).
   */
  learningsBlock?: string;
  frames: FrameImage[];
}

export interface AIAnalysisInput {
  frames: FrameImage[];
  videoTitle: string;
  sourceType: string;
  durationSeconds: number | null;
}

export type QuotaErrorKind = "quota" | "no_keys" | "all_exhausted";

export class AIQuotaError extends Error {
  readonly kind: QuotaErrorKind;

  constructor(kind: QuotaErrorKind, message: string) {
    super(message);
    this.name = "AIQuotaError";
    this.kind = kind;
  }
}

export interface AIProvider {
  readonly name: string;
  detectSport(ctx: SportContext): Promise<SportDetectionResult>;
  generateImprovements(ctx: ImprovementsContext): Promise<ImprovementsResult>;
  generateCoachReport(ctx: CoachContext): Promise<CoachReportResult>;
  coachChat(ctx: CoachChatContext): Promise<string>;
  /** Pasada 1: audita, clasifica el error y elige la corrección más crítica. */
  auditAnalysis(ctx: AuditContext): Promise<AuditVerdict>;
}