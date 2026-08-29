export type Sport = "futbol" | "padel" | "voleibol" | "baloncesto";
export type SourceType = "camera" | "upload" | "youtube";
export type VideoStatus = "pending" | "analyzing" | "ready" | "error";

export type Impact = "alta" | "media" | "baja";

export interface Metric {
  key: string;
  label: string;
  value: string;
  unit: string;
  target: string;
  rating: number;
}

export interface KeyResult {
  label: string;
  value: string;
  target: string;
}

export interface Okr {
  objective: string;
  keyResults: KeyResult[];
  progress: number;
}

export interface Highlight {
  minute: string;
  title: string;
  detail: string;
  category: string;
  impact: Impact;
}

export interface HeatZone {
  col: number;
  row: number;
  intensity: number;
}

export interface PlayerMovement {
  distanceKm: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  sprints: number;
}

export interface PlayerAnalysis {
  name: string;
  position: string;
  movement: PlayerMovement;
  kpis: Metric[];
  heatmap: HeatZone[];
}

export interface AnalysisResult {
  score: number;
  summary: string;
  metrics: Metric[];
  okrs: Okr[];
  highlights: Highlight[];
  players: PlayerAnalysis[];
}