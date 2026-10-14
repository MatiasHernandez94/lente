import type { CoachReportDrill, CoachReportPoint, ImprovementItem } from "@/lib/ai/providers/types";
import type { AuditFinding } from "./audit";

/**
 * Insights de IA guardados junto al análisis (`{videoId}.ai.json`), expuestos
 * por `GET /api/videos/[id]/sports` para que la vista pueda renderizar el
 * "informe accionable" con una sola llamada.
 */
export interface ReportInsights {
  sport_detection?: {
    sport?: string;
    confidence?: number;
    reason?: string;
  } | null;
  improvements?: {
    summary?: string;
    improvements?: ImprovementItem[];
  } | null;
  coach_report?: {
    summary?: string;
    positives?: CoachReportPoint[];
    improvements?: CoachReportPoint[];
    plan?: CoachReportDrill[];
  } | null;
  /**
   * Veredicto de la pasada 1: qué tipo de falla es y cuál es la corrección más
   * crítica. Es el hallazgo que desarrolla el informe del coach.
   */
  motor_audit?: {
    error_type?: string;
    based_on?: string;
    critical_fix?: { title?: string; detail?: string; cue?: string };
    discarded?: Array<{ option?: string; why_discarded?: string }>;
    time_s?: number | null;
    confidence?: "alta" | "media" | "baja";
    provider?: string;
    /** Auditoría determinista: por qué el análisis confía en estos números. */
    audit?: {
      sport?: string;
      mode?: string;
      findings?: AuditFinding[];
      issues?: Array<Pick<AuditFinding, "key" | "label" | "value" | "status" | "implication">>;
      coverage?: { audited: number; normal: number; out_of_range: number; unmeasurable: number };
      confidence?: "alta" | "media" | "baja";
      confidenceReason?: string;
    };
  } | null;
}

/** Punto unificado de mejora para el informe (fuente mejoras o coach report). */
export interface ActionItem {
  title: string;
  detail: string;
  priority?: "alta" | "media" | "baja";
  time_s?: number | null;
  referenceToMetric?: string;
}