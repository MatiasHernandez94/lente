import "server-only";
import { getClient } from "./db";
import type { AnalysisRecord, AnalysisRow, ScoutRow, UserRow, VideoRow } from "./schema";
import type { AnalysisResult, SourceType, Sport, VideoStatus } from "./analysis/types";
import type { ScoutCalibration, ScoutResultData, ScoutAssignment } from "./scout/types";
import type { VideoEvent } from "./events/meta";

function postError(operation: string, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`${operation}: ${message}`);
}

const parseAnalysis = (row: AnalysisRow): AnalysisRecord => ({
  score: row.score,
  result: JSON.parse(row.result) as AnalysisResult,
  generatedAt: row.generatedAt,
});

type VideoColumnRow = {
  id: string;
  user_id: string;
  title: string;
  sport: Sport;
  source_type: SourceType;
  source_ref: string | null;
  duration_seconds: number | null;
  players: string;
  status: VideoStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

const parseVideo = (row: VideoColumnRow): VideoRow => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  sport: row.sport,
  sourceType: row.source_type,
  sourceRef: row.source_ref,
  durationSeconds: row.duration_seconds,
  players: JSON.parse(row.players) as string[],
  status: row.status,
  errorMessage: row.error_message,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const VIDEO_COLUMNS =
  "id, user_id, title, sport, source_type, source_ref, duration_seconds, players, status, error_message, created_at, updated_at";

export async function createUser(input: {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}): Promise<void> {
  const { error } = await getClient()
    .from("users")
    .insert({
      id: input.id,
      name: input.name,
      email: input.email,
      password_hash: input.passwordHash,
      created_at: input.createdAt,
    });
  if (error) postError("createUser", error);
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { data, error } = await getClient()
    .from("users")
    .select("id, name, email, password_hash, created_at")
    .eq("email", email)
    .maybeSingle();
  if (error) postError("findUserByEmail", error);
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    passwordHash: data.password_hash,
    createdAt: data.created_at,
  };
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const { data, error } = await getClient()
    .from("users")
    .select("id, name, email, password_hash, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) postError("getUserById", error);
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    passwordHash: data.password_hash,
    createdAt: data.created_at,
  };
}

export async function createVideo(input: {
  id: string;
  userId: string;
  title: string;
  sport: Sport;
  sourceType: SourceType;
  sourceRef: string | null;
  durationSeconds: number;
  players: string[];
  createdAt: string;
}): Promise<VideoRow> {
  const { data, error } = await getClient()
    .from("videos")
    .insert({
      id: input.id,
      user_id: input.userId,
      title: input.title,
      sport: input.sport,
      source_type: input.sourceType,
      source_ref: input.sourceRef,
      duration_seconds: input.durationSeconds,
      players: JSON.stringify(input.players),
      status: "pending",
      created_at: input.createdAt,
      updated_at: input.createdAt,
    })
    .select(VIDEO_COLUMNS)
    .single();
  if (error) postError("createVideo", error);
  return parseVideo(data as VideoColumnRow);
}

export async function listVideosByUser(userId: string): Promise<VideoRow[]> {
  const { data, error } = await getClient()
    .from("videos")
    .select(VIDEO_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) postError("listVideosByUser", error);
  return (data as VideoColumnRow[]).map(parseVideo);
}

export async function getVideoById(id: string): Promise<VideoRow | null> {
  const { data, error } = await getClient()
    .from("videos")
    .select(VIDEO_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) postError("getVideoById", error);
  if (!data) return null;
  return parseVideo(data as VideoColumnRow);
}

export async function updateVideoStatus(
  id: string,
  status: VideoStatus,
  errorMessage: string | null = null,
): Promise<void> {
  const { error } = await getClient()
    .from("videos")
    .update({ status, error_message: errorMessage, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) postError("updateVideoStatus", error);
}

export async function saveAnalysis(
  videoId: string,
  result: AnalysisResult,
  generatedAt: string,
): Promise<void> {
  const { error } = await getClient().from("analyses").upsert(
    { video_id: videoId, score: result.score, result: JSON.stringify(result), generated_at: generatedAt },
    { onConflict: "video_id" },
  );
  if (error) postError("saveAnalysis", error);
}

export async function getAnalysisForVideo(videoId: string): Promise<AnalysisRecord | null> {
  const { data, error } = await getClient()
    .from("analyses")
    .select("video_id, score, result, generated_at")
    .eq("video_id", videoId)
    .maybeSingle();
  if (error) postError("getAnalysisForVideo", error);
  if (!data) return null;
  return parseAnalysis({
    videoId: data.video_id,
    score: data.score,
    result: data.result,
    generatedAt: data.generated_at,
  });
}

type ScoutColumnRow = {
  video_id: string;
  status: string;
  fps: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  tracks_json: string | null;
  teams_json: string | null;
  players_json: string | null;
  calibration_json: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

const SCOUT_COLUMNS =
  "video_id, status, fps, width, height, duration_seconds, tracks_json, teams_json, players_json, calibration_json, error_message, created_at, updated_at";

const parseScoutRow = (row: ScoutColumnRow): ScoutRow => ({
  videoId: row.video_id,
  status: row.status,
  fps: row.fps,
  width: row.width,
  height: row.height,
  durationSeconds: row.duration_seconds,
  tracksJson: row.tracks_json,
  teamsJson: row.teams_json,
  playersJson: row.players_json,
  calibrationJson: row.calibration_json,
  errorMessage: row.error_message,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function getScoutAnalysis(videoId: string): Promise<ScoutRow | null> {
  const { data, error } = await getClient()
    .from("scout_analyses")
    .select(SCOUT_COLUMNS)
    .eq("video_id", videoId)
    .maybeSingle();
  if (error) postError("getScoutAnalysis", error);
  if (!data) return null;
  return parseScoutRow(data as ScoutColumnRow);
}

async function ensureScoutRow(videoId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await getClient().from("scout_analyses").upsert(
    { video_id: videoId, status: "none", created_at: now, updated_at: now },
    { onConflict: "video_id", ignoreDuplicates: true },
  );
  if (error) postError("ensureScoutRow", error);
}

export async function updateScoutStatus(
  videoId: string,
  status: string,
  errorMessage: string | null = null,
): Promise<void> {
  await ensureScoutRow(videoId);
  const { error } = await getClient()
    .from("scout_analyses")
    .update({ status, error_message: errorMessage, updated_at: new Date().toISOString() })
    .eq("video_id", videoId);
  if (error) postError("updateScoutStatus", error);
}

export async function saveScoutResult(videoId: string, result: ScoutResultData): Promise<void> {
  await ensureScoutRow(videoId);
  const { error } = await getClient()
    .from("scout_analyses")
    .update({
      status: "ready",
      fps: result.analysis.fps,
      width: result.video.width,
      height: result.video.height,
      duration_seconds: Math.round(result.video.durationSec),
      tracks_json: JSON.stringify(result),
      teams_json: result.teams ? JSON.stringify(result.teams) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("video_id", videoId);
  if (error) postError("saveScoutResult", error);
}

export async function saveScoutCalibration(
  videoId: string,
  calibration: ScoutCalibration,
): Promise<void> {
  await ensureScoutRow(videoId);
  const { error } = await getClient()
    .from("scout_analyses")
    .update({ calibration_json: JSON.stringify(calibration), updated_at: new Date().toISOString() })
    .eq("video_id", videoId);
  if (error) postError("saveScoutCalibration", error);
}

export async function saveScoutPlayers(
  videoId: string,
  players: ScoutAssignment[],
): Promise<void> {
  await ensureScoutRow(videoId);
  const { error } = await getClient()
    .from("scout_analyses")
    .update({ players_json: JSON.stringify(players), updated_at: new Date().toISOString() })
    .eq("video_id", videoId);
  if (error) postError("saveScoutPlayers", error);
}

export async function listVideoEvents(videoId: string): Promise<VideoEvent[]> {
  const { data, error } = await getClient()
    .from("video_events")
    .select("id, video_id, team, player, event_type, x, y, t, points, created_at")
    .eq("video_id", videoId)
    .order("t", { ascending: true });
  if (error) postError("listVideoEvents", error);
  return (data as unknown as VideoEvent[]).map((event) => ({ ...event }));
}

export async function createVideoEvent(input: VideoEvent): Promise<void> {
  const { error } = await getClient().from("video_events").insert({
    id: input.id,
    video_id: input.videoId,
    team: input.team,
    player: input.player,
    event_type: input.eventType,
    x: input.x,
    y: input.y,
    t: input.t,
    points: input.points,
    created_at: input.createdAt,
  });
  if (error) postError("createVideoEvent", error);
}

export async function deleteVideoEvent(id: string): Promise<void> {
  const { error } = await getClient().from("video_events").delete().eq("id", id);
  if (error) postError("deleteVideoEvent", error);
}
