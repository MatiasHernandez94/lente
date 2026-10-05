import "server-only";
import { readFileSync } from "node:fs";
import { getVideoById } from "@/lib/repo";
import { claimNextPendingJob, finishProcessingJob, isRetryableError, MAX_JOB_ATTEMPTS, requeueProcessingJob } from "@/lib/processor";
import { errorPayload as toErrorPayload } from "@/lib/retry";
import { AIActionError, detectSportWithVision, generateCoachReportWithVision, generateImprovementsWithVision, saveVideoAIInsight } from "@/lib/ai/video-agent";

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

async function sendAlert(message: string): Promise<void> {
  const url = process.env.LENTE_ALERTS_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: message }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error("[worker] No se pudo enviar la alerta:", err);
  }
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
    const analysis = await getSportAnalysis(video.id);
    const result = await generateCoachReportWithVision(video, (analysis ?? null) as Record<string, unknown> | null);
    await saveVideoAIInsight(video.id, "coach_report", { ...result, at: new Date().toISOString() });
    return;
  }

  if (job.kind === "sports") {
    const { startSportAnalysis } = await import("@/lib/sports/service");
    const { updateJobProgress } = await import("@/lib/processor");
    const sampleFps = Number(job.payload?.sample_fps ?? 5);
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

  throw new Error(`Tipo de job desconocido: ${job.kind}`);
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
        await sendAlert(`❌ Lente: fallo final del análisis "${job.kind}" (video ${job.videoId}) después de ${job.attempts} intentos.\n${String(payload.message ?? payload.kind ?? "error")}`);
      }
    } catch (e) {
      console.error("[worker] No se pudo guardar el error del job:", e);
    }
  }
}

export async function main() {
  console.log(`[worker] Arrancando. Polling cada ${POLL_MS}ms.`);
  while (true) {
    await tick();
    await sleep(POLL_MS);
  }
}

if (process.argv[1] && process.argv[1].endsWith("worker.ts")) {
  main().catch((error) => {
    console.error("[worker] Error fatal:", error);
    process.exit(1);
  });
}