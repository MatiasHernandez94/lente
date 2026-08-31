import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { getVideoById } from "@/lib/repo";
import { ApiServiceError } from "@/lib/services/videoService";
import {
  getScoutCalibration,
  getScoutData,
  getScoutStatus,
  listScoutAssignments,
  scoutPlayerMetrics,
  startScout,
} from "@/lib/scout/service";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/scout">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no corresponde al usuario.");
    }

    const status = await getScoutStatus(video);
    const data = await getScoutData(video);
    const assignments = await listScoutAssignments(video);
    const calibration = await getScoutCalibration(video);
    const metrics = await scoutPlayerMetrics(video);

    return NextResponse.json({
      status,
      data,
      assignments,
      calibration,
      metrics,
    });
  } catch (error) {
    return serializeError(error);
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/scout">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no corresponde al usuario.");
    }

    await startScout(video);
    return NextResponse.json({ status: "running" });
  } catch (error) {
    return serializeError(error);
  }
}