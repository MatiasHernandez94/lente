import type { Sport } from "@/lib/analysis/types";

export interface FrameImage {
  base64: string;
  mimeType: string;
  timeSeconds: number;
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
}