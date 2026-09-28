import { NextResponse } from "next/server";
import { requireApiUser, serializeError } from "@/lib/api";
import { requeueFailedJobNow } from "@/lib/processor";
import { ApiServiceError } from "@/lib/services/videoService";

interface RequeueRouteProps {
  params: Promise<{ jobId: string }>;
}

export async function POST(request: Request, ctx: RequeueRouteProps): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    if (user.rol !== "profesor") {
      throw new ApiServiceError(403, "Solo los profesores pueden re-intentar trabajos.");
    }
    const { jobId } = await ctx.params;
    await requeueFailedJobNow(jobId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serializeError(error);
  }
}