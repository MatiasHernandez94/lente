import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireApiUser, serializeError } from "@/lib/api";
import { getAnalysisForVideo, getVideoById } from "@/lib/repo";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/videos/[id]">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;

    const video = getVideoById(id);
    if (!video || video.userId !== user.id) {
      return NextResponse.json({ error: "El video no existe o no le corresponde." }, { status: 404 });
    }

    const analysis = getAnalysisForVideo(video.id);
    return NextResponse.json({ video, analysis });
  } catch (error) {
    return serializeError(error);
  }
}