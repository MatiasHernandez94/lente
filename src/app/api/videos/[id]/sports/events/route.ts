import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireApiUser, serializeError } from "@/lib/api";
import { getVideoById } from "@/lib/repo";
import { ApiServiceError } from "@/lib/services/videoService";
import { getEvents } from "@/lib/sports/service";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/sports/events">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no corresponde al usuario.");
    }

    const url = new URL(request.url);
    const typeFilter = url.searchParams.get("type") ?? undefined;

    const events = await getEvents(id, typeFilter);
    if (!events) {
      return NextResponse.json({ status: "none" });
    }

    return NextResponse.json({ status: "ready", events });
  } catch (error) {
    return serializeError(error);
  }
}
