import "server-only";
import { getDb } from "./db";
import type { AnalysisRecord, AnalysisRow, UserRow, VideoRow } from "./schema";
import type { AnalysisResult, SourceType, Sport, VideoStatus } from "./analysis/types";

const parseAnalysis = (row: AnalysisRow): AnalysisRecord => ({
  score: row.score,
  result: JSON.parse(row.result) as AnalysisResult,
  generatedAt: row.generatedAt,
});

interface VideoRowRaw extends Omit<VideoRow, "players"> {
  players: string;
}

const parseVideo = (row: VideoRowRaw): VideoRow => ({
  ...row,
  players: JSON.parse(row.players) as string[],
});

export function createUser(input: { id: string; name: string; email: string; passwordHash: string; createdAt: string }): void {
  getDb()
    .prepare(
      `INSERT INTO users (id, name, email, password_hash, created_at)
       VALUES (@id, @name, @email, @passwordHash, @createdAt)`,
    )
    .run(input);
}

export function findUserByEmail(email: string): UserRow | null {
  const row = getDb()
    .prepare(`SELECT id, name, email, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE email = ?`)
    .get(email) as UserRow | undefined;
  return row ?? null;
}

export function getUserById(id: string): UserRow | null {
  const row = getDb()
    .prepare(`SELECT id, name, email, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE id = ?`)
    .get(id) as UserRow | undefined;
  return row ?? null;
}

export function createVideo(input: {
  id: string;
  userId: string;
  title: string;
  sport: Sport;
  sourceType: SourceType;
  sourceRef: string | null;
  durationSeconds: number;
  players: string[];
  createdAt: string;
}): VideoRow {
  const updatedAt = input.createdAt;
  getDb()
    .prepare(
      `INSERT INTO videos (id, user_id, title, sport, source_type, source_ref, duration_seconds, players, status, created_at, updated_at)
       VALUES (@id, @userId, @title, @sport, @sourceType, @sourceRef, @durationSeconds, @players, 'pending', @createdAt, @updatedAt)`,
    )
    .run({ ...input, players: JSON.stringify(input.players), updatedAt });
  return getVideoById(input.id) as VideoRow;
}

export function listVideosByUser(userId: string): VideoRow[] {
  const rows = getDb()
    .prepare(
      `SELECT id, user_id AS userId, title, sport, source_type AS sourceType, source_ref AS sourceRef,
              duration_seconds AS durationSeconds, players, status, error_message AS errorMessage,
              created_at AS createdAt, updated_at AS updatedAt
       FROM videos WHERE user_id = ? ORDER BY created_at DESC`,
    )
    .all(userId) as VideoRowRaw[];
  return rows.map(parseVideo);
}

export function getVideoById(id: string): VideoRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, user_id AS userId, title, sport, source_type AS sourceType, source_ref AS sourceRef,
              duration_seconds AS durationSeconds, players, status, error_message AS errorMessage,
              created_at AS createdAt, updated_at AS updatedAt
       FROM videos WHERE id = ?`,
    )
    .get(id) as VideoRowRaw | undefined;
  return row ? parseVideo(row) : null;
}

export function updateVideoStatus(id: string, status: VideoStatus, errorMessage: string | null = null): void {
  getDb()
    .prepare(`UPDATE videos SET status = ?, error_message = ?, updated_at = ? WHERE id = ?`)
    .run(status, errorMessage, new Date().toISOString(), id);
}

export function saveAnalysis(videoId: string, result: AnalysisResult, generatedAt: string): void {
  getDb()
    .prepare(
      `INSERT INTO analyses (video_id, score, result, generated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(video_id) DO UPDATE SET score = excluded.score, result = excluded.result, generated_at = excluded.generated_at`,
    )
    .run(videoId, result.score, JSON.stringify(result), generatedAt);
}

export function getAnalysisForVideo(videoId: string): AnalysisRecord | null {
  const row = getDb()
    .prepare(`SELECT video_id AS videoId, score, result, generated_at AS generatedAt FROM analyses WHERE video_id = ?`)
    .get(videoId) as AnalysisRow | undefined;
  return row ? parseAnalysis(row) : null;
}