import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireApiUser, serializeError } from "@/lib/api";
import { getVideoById } from "@/lib/repo";
import { ApiServiceError } from "@/lib/services/videoService";
import {
  startSportAnalysis,
  getSportAnalysis,
} from "@/lib/sports/service";

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

    const analysis = await startSportAnalysis(video, options);
    return NextResponse.json({ status: "ready", analysis });
  } catch (error) {
    return serializeError(error);
  }
}
