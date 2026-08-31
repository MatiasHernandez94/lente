import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { getVideoById } from "@/lib/repo";
import { ApiServiceError } from "@/lib/services/videoService";
import { saveCalibration, scoutPlayerMetrics } from "@/lib/scout/service";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/scout/calibrate">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no corresponde al usuario.");
    }

    const body = (await request.json()) as { points: { x: number; y: number }[]; court: { width: number; height: number } };
    const calibration = await saveCalibration(video, body);
    const metrics = await scoutPlayerMetrics(video);

    return NextResponse.json({ calibration, metrics });
  } catch (error) {
    return serializeError(error);
  }
}