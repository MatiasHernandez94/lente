import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { deleteVideoEvent, getVideoById } from "@/lib/repo";
import { ApiServiceError } from "@/lib/services/videoService";

export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/videos/[id]/events/[eventId]">,
): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    const { id, eventId } = await ctx.params;
    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no corresponde al usuario.");
    }
    await deleteVideoEvent(eventId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serializeError(error);
  }
}