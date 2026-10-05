import { NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { getJobById, requeueFailedJobNow } from "@/lib/processor";
import { canOperateVideo } from "@/lib/ops/service";
import { ApiServiceError } from "@/lib/services/videoService";

interface RequeueRouteProps {
  params: Promise<{ jobId: string }>;
}

export async function POST(request: Request, ctx: RequeueRouteProps): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    if (user.rol !== "profesor") {
      throw new ApiServiceError(403, "Solo los profesores pueden re-intentar trabajos.");
    }

    const { jobId } = await ctx.params;
    const job = await getJobById(jobId);
    // 404 (no 403) para no revelar la existencia de jobs de otros usuarios.
    if (!job) throw new ApiServiceError(404, "El trabajo no existe.");

    const allowed = await canOperateVideo(user.id, job.videoId);
    if (!allowed) throw new ApiServiceError(404, "El trabajo no existe o no corresponde al usuario.");

    await requeueFailedJobNow(job.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serializeError(error);
  }
}