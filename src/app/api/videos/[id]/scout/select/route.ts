import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { getVideoById } from "@/lib/repo";
import { ApiServiceError } from "@/lib/services/videoService";
import { savePlayerAssignment, scoutPlayerMetrics } from "@/lib/scout/service";
import type { ScoutAssignment, ScoutPlayerMetrics } from "@/lib/scout/types";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/scout/select">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no corresponde al usuario.");
    }

    const body = (await request.json()) as Partial<ScoutAssignment>;
    const assignment = await savePlayerAssignment(video, {
      trackId: body.trackId ?? -1,
      name: body.name ?? "",
      team: body.team ?? "A",
    });
    const metrics: ScoutPlayerMetrics[] = await scoutPlayerMetrics(video);

    return NextResponse.json({ assignment, metrics });
  } catch (error) {
    return serializeError(error);
  }
}