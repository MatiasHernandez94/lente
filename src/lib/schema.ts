import type { AnalysisResult, SourceType, Sport, VideoStatus } from "./analysis/types";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
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