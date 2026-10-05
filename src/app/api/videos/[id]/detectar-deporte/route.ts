import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireApiUser, serializeError } from "@/lib/api";
import { getVideoById } from "@/lib/repo";
import { AIActionError, detectSportWithVision, getVideoAIInsight, saveVideoAIInsight } from "@/lib/ai/video-agent";
import { ApiServiceError } from "@/lib/services/videoService";
import { getActiveProcessingJob, isProcessorQueueEnabled, enqueueProcessingJob } from "@/lib/processor";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/detectar-deporte">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;

    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no le corresponde.");
    }

    const activeJob = await getActiveProcessingJob(id, "detect-sport").catch(() => null);
    const stored = await getVideoAIInsight(id).catch(() => null);
    const detection = stored?.sport_detection;

    if (detection) {
      return NextResponse.json({
        ok: true,
        sport: String(detection.sport ?? ""),
        confidence: Number(detection.confidence ?? 0),
        reason: String(detection.reason ?? ""),
        provider: String(detection.provider ?? ""),
        cached: true,
      });
    }
    if (activeJob) return NextResponse.json({ status: "queued", jobId: activeJob.id });
    return NextResponse.json({ status: "none" });
  } catch (error) {
    return serializeError(error);
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/detectar-deporte">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;

    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no le corresponde.");
    }

    if (isProcessorQueueEnabled()) {
      const { job } = await enqueueProcessingJob(id, "detect-sport");
      return NextResponse.json({ status: "queued", jobId: job.id });
    }

    const result = await detectSportWithVision(video);
    await saveVideoAIInsight(video.id, "sport_detection", { ...result, at: new Date().toISOString() });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof AIActionError) {
      return NextResponse.json(
        { error: error.message, kind: error.kind, detail: error.detail ?? null },
        { status: 200 }, // La app responde "no se pudo" sin romper flujo
      );
    }
    return serializeError(error);
  }
}