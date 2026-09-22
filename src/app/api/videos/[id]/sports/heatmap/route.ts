import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireApiUser, serializeError } from "@/lib/api";
import { getVideoById } from "@/lib/repo";
import { ApiServiceError } from "@/lib/services/videoService";
import { getTeamHeatmap } from "@/lib/sports/service";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/sports/heatmap">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no corresponde al usuario.");
    }

    const url = new URL(request.url);
    const teamId = parseInt(url.searchParams.get("team") ?? "0", 10);

    if (teamId !== 0 && teamId !== 1) {
      throw new ApiServiceError(400, "Team debe ser 0 o 1");
    }

    const heatmap = await getTeamHeatmap(id, teamId);
    if (!heatmap) {
      throw new ApiServiceError(404, "Heatmap no disponible");
    }

    return NextResponse.json({ team: teamId, heatmap });
  } catch (error) {
    return serializeError(error);
  }
}
