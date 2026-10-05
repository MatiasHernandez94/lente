import "server-only";
import { getClient } from "@/lib/db";
import { listAlumnos } from "@/lib/profile/service";

function postError(operation: string, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`${operation}: ${message}`);
}

/**
 * Videos que un profesor puede operar: los propios + los de sus alumnos
 * vinculados. Sin este filtro, el panel de operaciones expondría los jobs y
 * títulos de video de los demás usuarios de la plataforma.
 *
 * Nota: los videos de un alumno cuelgan de `videos.user_id` (el alumno es el
 * dueño); `alumno_id` está en null en todos los videos del proyecto, así que el
 * vínculo profesor-alumno se resuelve vía `profesor_alumno` y se filtra por
 * `user_id`.
 */
async function listOperableVideoIds(userId: string): Promise<string[]> {
  const alumnos = await listAlumnos(userId).catch(() => []);
  const ownerIds = [userId, ...alumnos.map((alumno) => alumno.id)];

  const { data, error } = await getClient()
    .from("videos")
    .select("id")
    .in("user_id", ownerIds);
  if (error) postError("ops.listOperableVideoIds", error);
  return (data ?? []).map((row) => String(row.id));
}

/** ¿Este profesor puede operar (ver/re-intentar) los jobs de este video? */
export async function canOperateVideo(userId: string, videoId: string): Promise<boolean> {
  const videoIds = await listOperableVideoIds(userId);
  return videoIds.includes(videoId);
}

export interface OpsJobRow {
  id: string;
  videoId: string;
  videoTitle: string | null;
  kind: string;
  status: string;
  error: Record<string, unknown> | null;
  attempts: number;
  runAfter: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface OpsStats {
  pending: number;
  processing: number;
  doneTotal: number;
  errorTotal: number;
  meanDoneMs: number | null;
  jobsLast7d: number;
  videosTotal: number;
}

export async function listRecentJobs(userId: string, limit = 50): Promise<OpsJobRow[]> {
  const videoIds = await listOperableVideoIds(userId);
  if (videoIds.length === 0) return [];

  const { data, error } = await getClient()
    .from("processing_jobs")
    .select("id, video_id, kind, status, error, attempts, run_after, created_at, started_at, finished_at, videos(title)")
    .in("video_id", videoIds)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) postError("ops.listRecentJobs", error);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    videoId: String(row.video_id),
    videoTitle: (row.videos as { title?: string } | null)?.title ?? null,
    kind: String(row.kind),
    status: String(row.status),
    error: (row.error as Record<string, unknown> | null) ?? null,
    attempts: Number(row.attempts ?? 0),
    runAfter: row.run_after ? String(row.run_after) : null,
    createdAt: String(row.created_at),
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
  }));
}

export async function getOpsStats(userId: string): Promise<OpsStats> {
  const videoIds = await listOperableVideoIds(userId);
  if (videoIds.length === 0) {
    return { pending: 0, processing: 0, doneTotal: 0, errorTotal: 0, meanDoneMs: null, jobsLast7d: 0, videosTotal: 0 };
  }
  const client = getClient();

  const [pending, processing, doneTotal, errorTotal, videosTotal] = await Promise.all([
    client.from("processing_jobs").select("id", { count: "exact", head: true }).in("video_id", videoIds).eq("status", "pending"),
    client.from("processing_jobs").select("id", { count: "exact", head: true }).in("video_id", videoIds).eq("status", "processing"),
    client.from("processing_jobs").select("id", { count: "exact", head: true }).in("video_id", videoIds).eq("status", "done"),
    client.from("processing_jobs").select("id", { count: "exact", head: true }).in("video_id", videoIds).eq("status", "error"),
    client.from("videos").select("id", { count: "exact", head: true }).in("id", videoIds),
  ]);

  for (const result of [pending, processing, doneTotal, errorTotal, videosTotal]) {
    if (result.error) postError("ops.getOpsStats", result.error);
  }

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: doneJobs } = await getClient()
    .from("processing_jobs")
    .select("created_at, finished_at")
    .in("video_id", videoIds)
    .eq("status", "done")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(200);

  const all7dResult = (await getClient()
    .from("processing_jobs")
    .select("id", { count: "exact", head: true })
    .in("video_id", videoIds)
    .gte("created_at", cutoff)) as unknown as { data: { count?: number } | null; error: unknown };
  const jobsLast7d = all7dResult.data?.count ?? doneJobs?.length ?? 0;

  const durations = (doneJobs ?? [])
    .map((row) => (row.created_at && row.finished_at ? Date.parse(row.finished_at) - Date.parse(row.created_at) : null))
    .filter((ms): ms is number => ms !== null && ms > 0);

  return {
    pending: pending.count ?? 0,
    processing: processing.count ?? 0,
    doneTotal: doneTotal.count ?? 0,
    errorTotal: errorTotal.count ?? 0,
    meanDoneMs: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    jobsLast7d,
    videosTotal: videosTotal.count ?? 0,
  };
}