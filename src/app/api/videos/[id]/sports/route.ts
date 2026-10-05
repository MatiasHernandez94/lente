import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireApiUser, serializeError } from "@/lib/api";
import { getVideoById } from "@/lib/repo";
import { ApiServiceError } from "@/lib/services/videoService";
import {
  startSportAnalysis,
  getSportAnalysis,
} from "@/lib/sports/service";
import { getActiveProcessingJob, getLatestProcessingJob, isProcessorQueueEnabled, enqueueProcessingJob } from "@/lib/processor";
import { resolveJobViewStatus, jobErrorMessage } from "@/lib/processor-status";

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
        return NextResponse.json({ status: "queued", jobId: activeJob?.id });
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

    let options: { sample_fps?: number } = {};
    try {
      options = await request.json();
    } catch {
      // Use defaults
    }

    if (isProcessorQueueEnabled()) {
      const job = await enqueueProcessingJob(id, "sports", { sample_fps: options.sample_fps ?? 5 });
      return NextResponse.json({ status: "queued", jobId: job.id });
    }

    const analysis = await startSportAnalysis(video, options);
    return NextResponse.json({ status: "ready", analysis });
  } catch (error) {
    return serializeError(error);
  }
}
