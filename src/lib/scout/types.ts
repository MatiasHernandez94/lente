export interface ScoutPoint {
  t: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ScoutTrack {
  id: number;
  born: number;
  color: [number, number, number] | null;
  team: "A" | "B" | null;
  points: ScoutPoint[];
}

export type ScoutTeamKey = "A" | "B";

export interface ScoutTeams {
  A: [number, number, number];
  B: [number, number, number];
}

export interface ScoutResultData {
  video: { width: number; height: number; durationSec: number };
  analysis: { fps: number; frames: number };
  tracks: ScoutTrack[];
  teams: ScoutTeams | null;
  meta?: { demoVersion?: number };
}

export interface ScoutCalibration {
  points: { x: number; y: number }[];
  court: { width: number; height: number };
  homography: number[][];
}

export interface ScoutAssignment {
  trackId: number;
  name: string;
  team: ScoutTeamKey;
}

export interface ScoutPlayerMetrics {
  trackId: number;
  name: string;
  team: ScoutTeamKey;
  color: [number, number, number] | null;
  distanceM: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  sprints: number;
  playTimeS: number;
}

export type ScoutStatus = "none" | "running" | "ready" | "error";

export interface ScoutSnapshot {
  status: ScoutStatus;
  data: ScoutResultData | null;
  assignments: ScoutAssignment[];
  calibration: ScoutCalibration | null;
  metrics: ScoutPlayerMetrics[];
}