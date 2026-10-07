import { NextRequest, NextResponse } from "next/server";
import { sendAlert } from "@/lib/alerts";
import { getClient } from "@/lib/db";
import { readWorkerHeartbeat } from "@/lib/heartbeat";

/**
 * Chequeo proactivo de salud de la cola de análisis.
 *
 * Dos disparadores:
 * - Vercel Hobby: cron diario en `vercel.json`.
 * - Scheduler externo (cron-job.org, cada 10 min): en realidad es el que
 *   importa, porque el diario solo sirve de red de seguridad.
 *
 * Detecta lo que el worker no puede reportar porque está muerto: proceso
 * caído, cola sin consumir y jobs clavados en `processing`.
 */

/** El worker escribe cada 60s; 10 min de tolerancia cubre caídas de red/DB. */
const WORKER_STALE_MS = 10 * 60_000;
/** Un job pendiente más viejo que esto, sin nadie procesando, es cola estancada. */
const STUCK_QUEUE_MS = 15 * 60_000;
/** El análisis más largo demora ~40 min; 60 min es un tope conservador. */
const STALE_PROCESSING_MS = 60 * 60_000;

const DEFAULT_SINCE_MINUTES = 15;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}` || header === secret;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET sin configurar: el chequeo queda deshabilitado." },
      { status: 503 },
    );
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const sinceMinutes = Math.max(
    1,
    Math.min(24 * 60, Number(request.nextUrl.searchParams.get("sinceMinutes")) || DEFAULT_SINCE_MINUTES),
  );
  const now = Date.now();
  const client = getClient();
  const checks: Record<string, unknown> = {};
  const counts: Record<string, number> = {};
  const alerts: string[] = [];

  // ── 1. ¿Está vivo el worker? ─────────────────────────────────────────
  try {
    const heartbeat = await readWorkerHeartbeat();
    const lastSeenMs = heartbeat ? Date.parse(heartbeat.lastSeen) : Number.NaN;
    const ageMs = Number.isFinite(lastSeenMs) ? now - lastSeenMs : Number.POSITIVE_INFINITY;
    checks.worker = {
      lastSeen: heartbeat?.lastSeen ?? null,
      ageSeconds: Number.isFinite(ageMs) ? Math.round(ageMs / 1000) : null,
      stale: ageMs > WORKER_STALE_MS,
    };
    if (ageMs > WORKER_STALE_MS) {
      const detail = heartbeat
        ? `Último heartbeat hace ${Math.round(ageMs / 60_000)} min (worker ${heartbeat.workerId}).`
        : "El worker nunca escribió el heartbeat: no está corriendo.";
      await sendAlert({
        level: "error",
        title: "Worker de análisis caído",
        message: `${detail} Los análisis en cola no se están procesando.`,
        data: { worker: heartbeat?.workerId ?? null, ageMinutes: Math.round(ageMs / 60_000) },
      });
      alerts.push("worker_stale");
    }
  } catch (error) {
    checks.worker = { error: error instanceof Error ? error.message : String(error) };
  }

  // ── 2. ¿Hay trabajo esperando sin nadie que lo tome? ─────────────────
  try {
    const { data, error } = await client
      .from("processing_jobs")
      .select("id, kind, video_id, created_at, run_after")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(20);
    if (error) throw new Error(error.message);

    const eligible = (data ?? []).filter(
      (row) => !row.run_after || Date.parse(row.run_after) <= now,
    );
    const oldest = eligible[0];
    const { data: processing, error: processingErr } = await client
      .from("processing_jobs")
      .select("id, started_at")
      .eq("status", "processing")
      .order("started_at", { ascending: false })
      .limit(1);
    if (processingErr) throw new Error(processingErr.message);

    const someoneWorking = Boolean(
      processing?.[0]?.started_at && now - Date.parse(processing[0].started_at) < STALE_PROCESSING_MS,
    );
    const queueAgeMs = oldest ? now - Date.parse(oldest.created_at) : 0;
    const stuck = Boolean(oldest) && !someoneWorking && queueAgeMs > STUCK_QUEUE_MS;

    counts.pending = eligible.length;
    counts.processing = processing?.length ?? 0;
    checks.queue = {
      pending: eligible.length,
      someoneWorking,
      oldestAgeMinutes: oldest ? Math.round(queueAgeMs / 60_000) : null,
      stuck,
    };

    if (stuck && oldest) {
      await sendAlert({
        level: "error",
        title: "Cola de análisis estancada",
        message: `${eligible.length} trabajo(s) en cola desde hace ${Math.round(queueAgeMs / 60_000)} min y ningún worker lo tomó.`,
        data: { kind: oldest.kind, videoId: oldest.video_id, jobId: oldest.id },
      });
      alerts.push("queue_stuck");
    }
  } catch (error) {
    checks.queue = { error: error instanceof Error ? error.message : String(error) };
  }

  // ── 3. ¿Algo quedó clavado en processing? ────────────────────────────
  try {
    const staleSince = new Date(now - STALE_PROCESSING_MS).toISOString();
    const { data, error } = await client
      .from("processing_jobs")
      .select("id, kind, video_id, started_at")
      .eq("status", "processing")
      .lt("started_at", staleSince)
      .limit(10);
    if (error) throw new Error(error.message);
    counts.staleProcessing = data?.length ?? 0;
    if (data && data.length > 0) {
      await sendAlert({
        level: "error",
        title: "Análisis atascados en processing",
        message: `${data.length} job(s) llevan más de ${Math.round(STALE_PROCESSING_MS / 60_000)} min en processing: el worker murió a mitad.`,
        data: { kind: data[0].kind, videoId: data[0].video_id, jobId: data[0].id },
      });
      alerts.push("stale_processing");
    }
  } catch (error) {
    checks.staleProcessing = { error: error instanceof Error ? error.message : String(error) };
  }

  // ── 4. Digest de errores (informativo; el worker ya avisa al instante) ──
  try {
    const since = new Date(now - sinceMinutes * 60_000).toISOString();
    const { data, error } = await client
      .from("processing_jobs")
      .select("id, kind, finished_at")
      .eq("status", "error")
      .gte("finished_at", since)
      .limit(20);
    if (error) throw new Error(error.message);
    counts.errorsInWindow = data?.length ?? 0;
    checks.errors = { windowMinutes: sinceMinutes, count: data?.length ?? 0 };
  } catch (error) {
    checks.errors = { error: error instanceof Error ? error.message : String(error) };
  }

  return NextResponse.json({ ok: true, alerts, checks, counts });
}
