import "server-only";
import { readFileSync } from "node:fs";
import { getVideoById } from "@/lib/repo";
import { claimNextPendingJob, finishProcessingJob } from "@/lib/processor";
import { AIActionError, detectSportWithVision, generateImprovementsWithVision, saveVideoAIInsight } from "@/lib/ai/video-agent";

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
  const message = error instanceof Error ? error.message : String(error);
  return { message, kind: "internal", detail: null };
}

async function processJob(job: { id: string; videoId: string; kind: string; payload?: Record<string, unknown> | null }) {
  const video = await getVideoById(job.videoId);
  if (!video) {
    await finishProcessingJob(job.id, "error", { message: "El video no existe.", kind: "video_unavailable", detail: null });
    return;
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

  if (job.kind === "sports") {
    const { startSportAnalysis } = await import("@/lib/sports/service");
    const sampleFps = Number(job.payload?.sample_fps ?? 5);
    await startSportAnalysis(video, { sample_fps: sampleFps });
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
    await finishProcessingJob(job.id, "error", payload).catch((e) => {
      console.error("[worker] No se pudo guardar el error del job:", e);
    });
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