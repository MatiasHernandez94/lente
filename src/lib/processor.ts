import "server-only";
import { getClient } from "./db";
import { sendAlert } from "./alerts";
import type { ProcessingJobKind, ProcessingJobRow, ProcessingJobStatus } from "./schema";
import { retryDelayMs } from "./retry";
import { staleMinutesForKind } from "./processor-status";

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

/**
 * Último job de cualquier estado para un video+kind.
 *
 * Sirve para distinguir dos casos que `getActiveProcessingJob` no separa:
 * un job encolado que se está reintentando (pending + error previo => sigue en
 * cola, no falló) y un job que agotó sus reintentos (status error => falló de
 * verdad y hay que avisarle al usuario).
 */
export async function getLatestProcessingJob(
  videoId: string,
  kind: ProcessingJobKind,
): Promise<ProcessingJobRow | null> {
  const { data, error } = await getClient()
    .from("processing_jobs")
    .select(JOB_COLUMNS)
    .eq("video_id", videoId)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestProcessingJob: ${error.message}`);
  if (!data) return null;
  return parseJob(data);
}

/** Devuelve un job por su id (cualquier estado), o null. */
export async function getJobById(id: string): Promise<ProcessingJobRow | null> {
  const { data, error } = await getClient()
    .from("processing_jobs")
    .select(JOB_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getJobById: ${error.message}`);
  if (!data) return null;
  return parseJob(data);
}

/**
 * Elección del único job activo para (video, kind).
 *
 * `insert` + comprobar no es atómico: cuatro POST simultáneos no ven ningún job
 * activo y los cuatro insertan. Tras insertar, releemos los jobs activos y gana
 * el más antiguo; el perdedor borra el suyo y devuelve el ganador, así solo uno
 * llega a analizar. El desempate por id hace la elección determinista.
 */
async function electSingleActiveJob(
  myJobId: string,
  videoId: string,
  kind: ProcessingJobKind,
): Promise<ProcessingJobRow> {
  const { data, error } = await getClient()
    .from("processing_jobs")
    .select(JOB_COLUMNS)
    .eq("video_id", videoId)
    .eq("kind", kind)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`electSingleActiveJob: ${error.message}`);

  const winner = data ? parseJob(data) : null;
  if (!winner || winner.id === myJobId) {
    if (!winner) throw new Error("electSingleActiveJob: el job insertado no aparece");
    return winner;
  }

  // Perdemos la carrera: este job no debe procesarse. Lo borramos por id (sin
  // filtro de estado: en inline se insertó como `processing`, no `pending`).
  await getClient().from("processing_jobs").delete().eq("id", myJobId);
  return winner;
}

/**
 * Registra un job directamente en `processing`, para ejecuciones en línea
 * (sin cola) que quieren ser visibles e idempotentes.
 *
 * Se inserta ya en `processing` a propósito: si se insertara en `pending`, el
 * worker externo podría reclamarlo en esa ventana y analizar el mismo video en
 * paralelo. Insertar en `processing` hace que un POST concurrente lo vea como
 * job activo; `electSingleActiveJob` resuelve el resto de la carrera.
 *
 * @returns el job con el que este request debe trabajar: el suyo si ganó, o el
 *          del request que ganó (en cuyo caso no debe analizar nada).
 */
export async function startInlineProcessingJob(
  videoId: string,
  kind: ProcessingJobKind,
  payload: Record<string, unknown> = {},
): Promise<{ job: ProcessingJobRow; isWinner: boolean }> {
  const existing = await getActiveProcessingJob(videoId, kind);
  if (existing) return { job: existing, isWinner: false };

  const now = new Date().toISOString();
  const { data, error } = await getClient()
    .from("processing_jobs")
    .insert({
      video_id: videoId,
      kind,
      payload: payload ?? {},
      status: "processing",
      started_at: now,
      updated_at: now,
      attempts: 1,
    })
    .select(JOB_COLUMNS)
    .single();
  if (error) throw new Error(`startInlineProcessingJob: ${error.message}`);

  const job = await electSingleActiveJob(String(data.id), videoId, kind);
  return { job, isWinner: job.id === String(data.id) };
}

/**
 * Publica el progreso de un job en processing (merge en `payload.progress`).
 * Best-effort: si falla, el análisis sigue; solo se pierde la barra de progreso.
 */
export async function updateJobProgress(jobId: string, progress: Record<string, unknown>): Promise<void> {
  try {
    const { data: current, error: readErr } = await getClient()
      .from("processing_jobs")
      .select("payload")
      .eq("id", jobId)
      .maybeSingle();
    if (readErr) return;
    const payload = (current?.payload as Record<string, unknown> | null) ?? {};
    const { error } = await getClient()
      .from("processing_jobs")
      .update({ payload: { ...payload, progress }, updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("status", "processing");
    if (error) throw new Error(error.message);
  } catch {
    // best effort
  }
}

/** Crea un job (si no hay uno activo para el mismo video+kind). Devuelve el job activo resultante. */
export async function enqueueProcessingJob(
  videoId: string,
  kind: ProcessingJobKind,
  payload: Record<string, unknown> = {},
): Promise<{ job: ProcessingJobRow; isWinner: boolean }> {
  const existing = await getActiveProcessingJob(videoId, kind);
  if (existing) return { job: existing, isWinner: false };

  const { data, error } = await getClient()
    .from("processing_jobs")
    .insert({ video_id: videoId, kind, payload: payload ?? {} })
    .select(JOB_COLUMNS)
    .single();
  if (error) throw new Error(`enqueueProcessingJob: ${error.message}`);

  // Cola compartida: sin elección, N POST simultáneos encolan N análisis.
  const job = await electSingleActiveJob(String(data.id), videoId, kind);
  return { job, isWinner: job.id === String(data.id) };
}

/**
 * Jobs en processing hace más de X minutos (worker muerto/caído) vuelven a pending.
 * El umbral depende del tipo de job: ver `staleMinutesForKind`.
 */
async function reviveStaleJobs(): Promise<void> {
  try {
    const client = getClient();
    const kinds = await client.from("processing_jobs").select("kind").eq("status", "processing");
    if (kinds.error) throw new Error(kinds.error.message);

    const kindsInUse = [...new Set((kinds.data ?? []).map((row) => String(row.kind)))];
    for (const kind of kindsInUse) {
      const cutoff = new Date(Date.now() - staleMinutesForKind(kind) * 60 * 1000).toISOString();
      const { error } = await client
        .from("processing_jobs")
        .update({ status: "pending", updated_at: new Date().toISOString() })
        .eq("status", "processing")
        .eq("kind", kind)
        .lt("started_at", cutoff);
      if (error) throw new Error(error.message);
    }
  } catch (error) {
    // Si no se pueden rescatar los jobs clavados, la cola se queda con
    // trabajo muerto y nadie se entera. Vale la pena avisar.
    console.error("[processor] reviveStaleJobs:", error);
    void sendAlert({
      level: "error",
      title: "No se pudieron rescatar jobs atascados",
      message: error instanceof Error ? error.message : String(error),
    });
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