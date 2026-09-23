import type { AnalysisResult, SourceType, Sport, VideoStatus } from "./analysis/types";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface VideoRow {
  id: string;
  userId: string;
  title: string;
  sport: Sport;
  sourceType: SourceType;
  sourceRef: string | null;
  durationSeconds: number | null;
  players: string[];
  status: VideoStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisRow {
  videoId: string;
  score: number;
  result: string;
  generatedAt: string;
}

export interface AnalysisRecord {
  score: number;
  result: AnalysisResult;
  generatedAt: string;
}

export interface ScoutRow {
  videoId: string;
  status: string;
  fps: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  tracksJson: string | null;
  teamsJson: string | null;
  playersJson: string | null;
  calibrationJson: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PendienteRow {
  id: string;
  userId: string;
  sourceText: string;
  content: string;
  createdAt: string;
}

export interface ExecutionRow {
  videoId: string;
  status: string;
  fps: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  exerciseId: string | null;
  resultJson: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}