import type { CoachReportDrill, CoachReportPoint, ImprovementItem } from "@/lib/ai/providers/types";

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
}

/** Punto unificado de mejora para el informe (fuente mejoras o coach report). */
export interface ActionItem {
  title: string;
  detail: string;
  priority?: "alta" | "media" | "baja";
  time_s?: number | null;
  referenceToMetric?: string;
}