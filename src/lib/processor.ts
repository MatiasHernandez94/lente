import "server-only";
import { getClient } from "./db";
import type { ProcessingJobKind, ProcessingJobRow, ProcessingJobStatus } from "./schema";
import { retryDelayMs } from "./retry";

export const PROCESSOR_QUEUE_FLAG = "LENTE_PROCESSOR_QUEUE";

export function isProcessorQueueEnabled(): boolean {
  return process.env[PROCESSOR_QUEUE_FLAG] === "1";
}

export function processorQueueEnabled(): boolean {
  return isProcessorQueueEnabled();
}

const JOB_COLUMNS =
  "id, video_id, kind, payload, status, error, attempts, created_at, updated_at, started_at, finished_at, run_after";

export { isRetryableError, MAX_JOB_ATTEMPTS, retryDelayMs } from "./retry";

function parseJob(data: Record<string, unknown>): ProcessingJobRow {
  return {
    id: String(data.id),
    videoId: String(data.video_id),
    kind: data.kind as ProcessingJobKind,
    payload: (data.payload as Record<string, unknown> | null) ?? null,
    status: data.status as ProcessingJobStatus,
    error: (data.error as Record<string, unknown> | null) ?? null,
    attempts: Number(data.attempts ?? 0),
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at),
    startedAt: data.started_at ? String(data.started_at) : null,
    finishedAt: data.finished_at ? String(data.finished_at) : null,
    runAfter: data.run_after ? String(data.run_after) : null,
  };
}

/** Devuelve el job activo (pending/processing) para un video+kind, si existe. */
export async function getActiveProcessingJob(
  videoId: string,
  kind: ProcessingJobKind,
): Promise<ProcessingJobRow | null> {
  const { data, error } = await getClient()
    .from("processing_jobs")
    .select(JOB_COLUMNS)
    .eq("video_id", videoId)
    .eq("kind", kind)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getActiveProcessingJob: ${error.message}`);
  if (!data) return null;
  return parseJob(data);
}

/** Crea un job (si no hay uno activo para el mismo video+kind). Devuelve el job activo resultante. */
export async function enqueueProcessingJob(
  videoId: string,
  kind: ProcessingJobKind,
  payload: Record<string, unknown> = {},
): Promise<ProcessingJobRow> {
  const existing = await getActiveProcessingJob(videoId, kind);
  if (existing) return existing;

  const { data, error } = await getClient()
    .from("processing_jobs")
    .insert({ video_id: videoId, kind, payload: payload ?? {} })
    .select(JOB_COLUMNS)
    .single();
  if (error) throw new Error(`enqueueProcessingJob: ${error.message}`);
  return parseJob(data);
}

/** Jobs en processing hace más de X minutos (worker muerto/caído) vuelven a pending. */
async function reviveStaleJobs(maxMinutes = 30): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - maxMinutes * 60 * 1000).toISOString();
    const { error } = await getClient()
      .from("processing_jobs")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .eq("status", "processing")
      .lt("started_at", cutoff);
    if (error) throw new Error(error.message);
  } catch {
    // best effort
  }
}

/** Reclama el job pending más antiguo (cuya run_after ya pasó) y lo marca como processing. */
export async function claimNextPendingJob(): Promise<ProcessingJobRow | null> {
  await reviveStaleJobs();
  const now = new Date().toISOString();
  const { data: next, error: selectError } = await getClient()
    .from("processing_jobs")
    .select("id, attempts")
    .eq("status", "pending")
    .or(`run_after.is.null,run_after.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (selectError) throw new Error(`claimNextPendingJob.select: ${selectError.message}`);
  if (!next) return null;

  const { data, error } = await getClient()
    .from("processing_jobs")
    .update({
      status: "processing",
      started_at: new Date().toISOString(),
      attempts: Number(next.attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", next.id)
    .eq("status", "pending")
    .select(JOB_COLUMNS)
    .single();
  if (error) throw new Error(`claimNextPendingJob.update: ${error.message}`);
  return parseJob(data);
}

/**
 * Reencola un job que falló con un error transitorio: vuelve a pending con un
 * retraso (run_after) calculado por backoff exponencial según los intentos ya
 * usados, y registra el último error en la columna error para diagnóstico.
 */
export async function requeueProcessingJob(
  id: string,
  error: Record<string, unknown> | null,
  attemptsUsed: number,
): Promise<void> {
  const runAfter = new Date(Date.now() + retryDelayMs(attemptsUsed)).toISOString();
  const { error: updateError } = await getClient()
    .from("processing_jobs")
    .update({
      status: "pending",
      error,
      run_after: runAfter,
      started_at: null,
      finished_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updateError) throw new Error(`requeueProcessingJob: ${updateError.message}`);
}

/** Re-intenta manualmente un job fallido: resetea intentos y lo vuelve a pending ya. */
export async function requeueFailedJobNow(id: string): Promise<void> {
  const { error } = await getClient()
    .from("processing_jobs")
    .update({
      status: "pending",
      attempts: 0,
      error: null,
      run_after: null,
      started_at: null,
      finished_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "error");
  if (error) throw new Error(`requeueFailedJobNow: ${error.message}`);
}

/** Marca un job como done o error. */
export async function finishProcessingJob(
  id: string,
  status: ProcessingJobStatus,
  error: Record<string, unknown> | null = null,
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  };
  if (error) update.error = error;
  if (status === "processing") {
    delete update.finished_at;
    update.started_at = new Date().toISOString();
  }
  const { error: updateError } = await getClient().from("processing_jobs").update(update).eq("id", id);
  if (updateError) throw new Error(`finishProcessingJob: ${updateError.message}`);
}