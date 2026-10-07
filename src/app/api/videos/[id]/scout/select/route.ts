import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { getVideoById } from "@/lib/repo";
import { ApiServiceError } from "@/lib/services/videoService";
import { savePlayerAssignment, scoutPlayerMetrics } from "@/lib/scout/service";
import type { ScoutPlayerMetrics } from "@/lib/scout/types";
import { readJsonBody, scoutSelectSchema } from "@/lib/validation/api";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/scout/select">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no corresponde al usuario.");
    }

    const body = await readJsonBody(request, scoutSelectSchema);
    const assignment = await savePlayerAssignment(video, body);
    const metrics: ScoutPlayerMetrics[] = await scoutPlayerMetrics(video);

    return NextResponse.json({ assignment, metrics });
  } catch (error) {
    return serializeError(error);
  }
}