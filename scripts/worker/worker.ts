import "server-only";
import { readFileSync } from "node:fs";
import { getVideoById } from "@/lib/repo";
import { claimNextPendingJob, finishProcessingJob, isRetryableError, MAX_JOB_ATTEMPTS, requeueProcessingJob } from "@/lib/processor";
import { errorPayload as toErrorPayload } from "@/lib/retry";
import { sportsOptionsSchema, validateInput } from "@/lib/validation/api";
import { sendAlert } from "@/lib/alerts";
import { currentWorkerId, readWorkerHeartbeat, writeWorkerHeartbeat } from "@/lib/heartbeat";
import { AIActionError, detectSportWithVision, generateCoachReportWithVision, generateImprovementsWithVision, saveVideoAIInsight } from "@/lib/ai/video-agent";
import type { AuditResult } from "@/lib/analysis/audit";

/**
 * La auditoría determinista se guarda tal cual (findings, coverage, confianza)
 * para que la UI pueda mostrar por qué el análisis dice lo que dice. El JSON se
 * persiste plano, así que va sin la referencia al tipo.
 */
function serializeAudit(audit: AuditResult): Record<string, unknown> {
  return {
    sport: audit.sport,
    mode: audit.mode,
    findings: audit.findings,
    issues: audit.issues.map(({ key, label, value, status, implication }) => ({
      key,
      label,
      value,
      status,
      implication,
    })),
    coverage: audit.coverage,
    confidence: audit.confidence,
    confidenceReason: audit.confidenceReason,
  };
}

// ── Env loading ────────────────────────────────────────────────────────────────
// tsx no carga .env.local por defecto; acá lo hacemos manual (como run-migrations).
function loadEnvFile(): void {
  const envPath = new URL("../../.env.local", import.meta.url);
  let content = "";
  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile();

const POLL_MS = Number(process.env.LENTE_WORKER_POLL_MS ?? 5000);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function errorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof AIActionError) {
    return { message: error.message, kind: error.kind, detail: error.detail ?? null };
  }
  return toErrorPayload(error);
}

async function processJob(job: { id: string; videoId: string; kind: string; payload?: Record<string, unknown> | null }) {
  const video = await getVideoById(job.videoId);
  if (!video) {
    const error = new Error("El video no existe.");
    (error as Error & { kind?: string }).kind = "video_unavailable";
    throw error;
  }

  if (job.kind === "detect-sport") {
    const result = await detectSportWithVision(video);
    await saveVideoAIInsight(video.id, "sport_detection", { ...result, at: new Date().toISOString() });
    return;
  }

  if (job.kind === "improvements") {
    const { getSportAnalysis } = await import("@/lib/sports/service");
    const analysis = await getSportAnalysis(video.id);
    const result = await generateImprovementsWithVision(video, (analysis ?? null) as Record<string, unknown> | null);
    await saveVideoAIInsight(video.id, "improvements", { ...result, at: new Date().toISOString() });
    return;
  }

  if (job.kind === "coach-report") {
    const { getSportAnalysis } = await import("@/lib/sports/service");
    const { runMotorAudit } = await import("@/lib/ai/video-agent");
    const analysis = await getSportAnalysis(video.id);

    // Pasada 1: audita las métricas contra rangos de referencia, clasifica la
    // falla y elige la corrección más crítica. Se guarda aunque falle la
    // pasada 2: el veredicto sirve aunque el informe no llegue a generarse.
    let verdict: Awaited<ReturnType<typeof runMotorAudit>> | null = null;
    try {
      verdict = await runMotorAudit(video, (analysis ?? null) as Record<string, unknown> | null);
      await saveVideoAIInsight(video.id, "motor_audit", {
        ...verdict,
        audit: serializeAudit(verdict.audit),
        at: new Date().toISOString(),
      });
    } catch (error) {
      // La auditoría determinista sigue siendo útil aunque falle el juicio del
      // modelo: se guarda sin el veredicto y el informe razona desde las métricas.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[worker] motor_audit falló para ${video.id}: ${message}`);
    }

    // Pasada 2: el informe desarrolla el veredicto en vez de re-razonarlo.
    const result = await generateCoachReportWithVision(
      video,
      (analysis ?? null) as Record<string, unknown> | null,
      verdict,
    );
    await saveVideoAIInsight(video.id, "coach_report", { ...result, at: new Date().toISOString() });
    return;
  }

  if (job.kind === "sports") {
    const { startSportAnalysis } = await import("@/lib/sports/service");
    const { updateJobProgress } = await import("@/lib/processor");
    // Mismo filtro que en la ruta: un sample_fps de 0 revienta Python con
    // ZeroDivisionError a mitad del video. Acá es defensa en profundidad, el
    // 400 real lo devolvió la API al encolar.
    const { sample_fps: sampleFps } = validateInput(job.payload ?? {}, sportsOptionsSchema);
    // Publica el avance para que la UI no muestre un spinner de 40 minutos.
    let lastPct = -1;
    await startSportAnalysis(video, {
      sample_fps: sampleFps,
      onProgress: (p) => {
        if (p.pct == null || p.pct === lastPct) return;
        lastPct = p.pct;
        void updateJobProgress(job.id, {
          pct: p.pct,
          stage: p.stage,
          framesDone: p.framesDone,
          framesTotal: p.framesTotal,
          updatedAt: p.updatedAt,
        });
      },
    });
    return;
  }

  const unknown = new Error(`Tipo de job desconocido: ${job.kind}`);
  (unknown as Error & { kind?: string }).kind = "unknown_job_kind";
  throw unknown;
}

export async function tick() {
  let job = null;
  try {
    job = await claimNextPendingJob();
  } catch (error) {
    console.error("[worker] Error reclamando job:", error);
    return;
  }
  if (!job) return;
  jobsClaimed++;

  console.log(`[worker] ▶ ${job.kind} (${job.videoId})`);
  try {
    await processJob({
      id: job.id,
      videoId: job.videoId,
      kind: job.kind,
      payload: job.payload,
    });
    await finishProcessingJob(job.id, "done");
    console.log(`[worker] ✓ ${job.kind} (${job.videoId})`);
  } catch (error) {
    console.error(`[worker] ✗ ${job.kind} (${job.videoId}):`, error);
    const payload = errorPayload(error);
    const willRetry = job.attempts < MAX_JOB_ATTEMPTS && isRetryableError(String(payload.kind ?? ""));
    try {
      if (willRetry) {
        await requeueProcessingJob(job.id, payload, job.attempts);
        console.log(`[worker] ↻ ${job.kind} (${job.videoId}) reintento ${job.attempts}/${MAX_JOB_ATTEMPTS}`);
      } else {
        await finishProcessingJob(job.id, "error", payload);
        await sendAlert({
          level: "error",
          title: `Fallo final de ${job.kind}`,
          message: String(payload.message ?? payload.kind ?? "error desconocido"),
          data: {
            jobId: job.id,
            videoId: job.videoId,
            kind: job.kind,
            errorKind: String(payload.kind ?? "internal"),
            intentos: job.attempts,
          },
        });
      }
    } catch (e) {
      console.error("[worker] No se pudo guardar el error del job:", e);
    }
  }
}

/** El worker escribe el heartbeat cada 60s (no en cada tick: 17k escrituras/día al pedo). */
const HEARTBEAT_MS = 60_000;
/** Si el hueco con el heartbeat previo supera esto, el proceso anterior murió. */
const RESTART_GAP_MS = 5 * 60_000;

const WORKER_ID = currentWorkerId();
const WORKER_VERSION = process.env.GIT_SHA ?? null;

let jobsClaimed = 0;
let lastHeartbeatAt = 0;

async function touchHeartbeat(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastHeartbeatAt < HEARTBEAT_MS) return;
  lastHeartbeatAt = now;
  await writeWorkerHeartbeat({
    workerId: WORKER_ID,
    pid: process.pid,
    version: WORKER_VERSION,
    jobsClaimed,
  });
}

/**
 * Al arrancar, si el heartbeat anterior de *este mismo* host es viejo, el
 * proceso previo se cayó sin poder avisar. Es la única forma de enterarse de
 * un crash sin infraestructura extra.
 */
async function reportPreviousGap(): Promise<void> {
  try {
    const previous = await readWorkerHeartbeat();
    if (!previous || previous.workerId !== WORKER_ID) return;
    const gapMs = Date.now() - Date.parse(previous.lastSeen);
    if (!Number.isFinite(gapMs) || gapMs < RESTART_GAP_MS) return;
    await sendAlert({
      level: "warn",
      title: "Worker reiniciado tras una caída",
      message: `El proceso anterior dejó de responder hace ${Math.round(gapMs / 60_000)} min. Ya vuelve a procesar la cola.`,
      data: { worker: WORKER_ID, version: WORKER_VERSION, jobsAlProcesoAnterior: previous.jobsClaimed },
    });
  } catch (error) {
    console.error("[worker] No se pudo leer el heartbeat previo:", error);
  }
}

export async function main() {
  console.log(`[worker] Arrancando. Polling cada ${POLL_MS}ms.`);
  await reportPreviousGap();
  await touchHeartbeat(true);
  while (true) {
    await tick();
    await touchHeartbeat();
    await sleep(POLL_MS);
  }
}

if (process.argv[1] && process.argv[1].endsWith("worker.ts")) {
  main().catch((error) => {
    console.error("[worker] Error fatal:", error);
    process.exit(1);
  });
}