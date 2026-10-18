import type { AnalysisResult, SourceType, Sport, VideoStatus } from "./analysis/types";

export type UserRol = "alumno" | "profesor";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  pesoKg: number | null;
  alturaCm: number | null;
  rol: UserRol;
  deporteDocente: string | null;
  tutorEmail: string | null;
  termsAccepted: boolean;
  termsAcceptedAt: string | null;
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
  alumnoId: string | null;
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

export interface CorreccionRow {
  id: string;
  videoId: string;
  profesorId: string;
  alumnoId: string;
  mensaje: string;
  minutoInicio: number | null;
  minutoFin: number | null;
  clipUrl: string | null;
  createdAt: string;
}

export interface CorreccionConProfesor extends CorreccionRow {
  profesorName: string;
}

export interface ConsultaRow {
  id: string;
  videoId: string;
  alumnoId: string;
  profesorId: string;
  autorId: string;
  autorRol: UserRol;
  mensaje: string;
  leida: boolean;
  createdAt: string;
}

export interface ConsultaConAutor extends ConsultaRow {
  autorName: string;
}

export type ProcessingJobKind = "detect-sport" | "improvements" | "sports" | "coach-report";
export type ProcessingJobStatus = "pending" | "processing" | "done" | "error";

export interface ProcessingJobRow {
  id: string;
  videoId: string;
  kind: ProcessingJobKind;
  payload: Record<string, unknown> | null;
  status: ProcessingJobStatus;
  error: Record<string, unknown> | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  runAfter: string | null;
}