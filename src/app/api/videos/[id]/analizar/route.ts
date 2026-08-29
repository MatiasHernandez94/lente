import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { runAnalysis } from "@/lib/services/videoService";
import { getAnalysisForVideo } from "@/lib/repo";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/analizar">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    const { id } = await ctx.params;

    const video = await runAnalysis(id, user.id);
    const analysis = getAnalysisForVideo(video.id);

    return NextResponse.json({ video, analysis });
  } catch (error) {
    return serializeError(error);
  }
}