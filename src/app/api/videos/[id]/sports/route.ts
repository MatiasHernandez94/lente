import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireApiUser, serializeError } from "@/lib/api";
import { getVideoById } from "@/lib/repo";
import { ApiServiceError } from "@/lib/services/videoService";
import {
  startSportAnalysis,
  getSportAnalysis,
} from "@/lib/sports/service";
import { getActiveProcessingJob, getLatestProcessingJob, isProcessorQueueEnabled, enqueueProcessingJob, startInlineProcessingJob, updateJobProgress, finishProcessingJob } from "@/lib/processor";
import { resolveJobViewStatus, jobErrorMessage } from "@/lib/processor-status";
import { errorPayload } from "@/lib/retry";
import { isProgressFresh, parseProgress, type JobProgress } from "@/lib/job-progress";
import type { ProcessingJobRow } from "@/lib/schema";

/**
 * Progreso publicado por el worker, si sigue siendo fresco. Un progreso viejo
 * (worker muerto) no se muestra: mejor "en cola" que un porcentaje congelado.
 */
function readJobProgress(job: ProcessingJobRow | null | undefined): JobProgress | null {
  const raw = job?.payload?.progress;
  if (!raw) return null;
  const parsed = parseProgress(JSON.stringify(raw));
  if (!parsed || !isProgressFresh(parsed)) return null;
  return {
    pct: parsed.pct,
    stage: parsed.stage,
    framesDone: parsed.framesDone,
    framesTotal: parsed.framesTotal,
    updatedAt: parsed.updatedAt,
  };
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/sports">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no corresponde al usuario.");
    }

    const analysis = await getSportAnalysis(id);
    if (!analysis) {
      const activeJob = await getActiveProcessingJob(id, "sports").catch(() => null);
      const latestJob = activeJob ? null : await getLatestProcessingJob(id, "sports").catch(() => null);
      const view = resolveJobViewStatus(activeJob, latestJob);
      if (view === "queued") {
        return NextResponse.json({
          status: "queued",
          jobId: activeJob?.id,
          progress: readJobProgress(activeJob),
          queuedAt: activeJob?.createdAt ?? null,
        });
      }
      if (view === "error") {
        return NextResponse.json({
          status: "error",
          error: jobErrorMessage(latestJob?.error, "El análisis deportivo falló."),
        });
      }
      return NextResponse.json({ status: "none" });
    }

    return NextResponse.json({ status: "ready", analysis });
  } catch (error) {
    return serializeError(error);
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/sports">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no corresponde al usuario.");
    }

    const existing = await getSportAnalysis(id);
    if (existing) {
      return NextResponse.json({ status: "ready", analysis: existing });
    }

    // Idempotencia: si ya hay un job activo (o quedó uno en processing de una
    // ejecución inline previa) no se lanza un segundo análisis. Sin esto, dos
    // clics rápidos -o dos pestañes-Starting dos procesos YOLO en paralelo.
    const activeJob = await getActiveProcessingJob(id, "sports").catch(() => null);
    if (activeJob) {
      return NextResponse.json({
        status: "queued",
        jobId: activeJob.id,
        progress: readJobProgress(activeJob),
        queuedAt: activeJob.createdAt,
      });
    }

    let options: { sample_fps?: number } = {};
    try {
      options = await request.json();
    } catch {
      // Use defaults
    }

    if (isProcessorQueueEnabled()) {
      const { job } = await enqueueProcessingJob(id, "sports", { sample_fps: options.sample_fps ?? 5 });
      return NextResponse.json({ status: "queued", jobId: job.id, queuedAt: job.createdAt });
    }

    // Ejecución en línea (sin cola): se registra el job en processing para que
    // quede visible en el panel y un POST concurrente no lance un segundo
    // análisis del mismo video.
    const { job: inlineJob, isWinner } = await startInlineProcessingJob(id, "sports", {
      sample_fps: options.sample_fps ?? 5,
    });
    // Perdimos la carrera: otro request ya está analizando este video. No
    // analizamos: solo delegamos el seguimiento del job ganador.
    if (!isWinner) {
      return NextResponse.json({
        status: "queued",
        jobId: inlineJob.id,
        queuedAt: inlineJob.createdAt,
        progress: readJobProgress(inlineJob),
      });
    }
    try {
      const analysis = await startSportAnalysis(video, {
        ...options,
        onProgress: (progress) => {
          void updateJobProgress(inlineJob.id, { ...progress });
        },
      });
      await finishProcessingJob(inlineJob.id, "done");
      return NextResponse.json({ status: "ready", analysis });
    } catch (error) {
      const payload = errorPayload(error);
      await finishProcessingJob(inlineJob.id, "error", payload);
      throw error;
    }
  } catch (error) {
    return serializeError(error);
  }
}
