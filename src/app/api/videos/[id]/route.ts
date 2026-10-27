import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { getAnalysisForVideo, getVideoById, updateVideo } from "@/lib/repo";
import { readJsonBody, videoPatchSchema } from "@/lib/validation/api";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/videos/[id]">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;

    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      return NextResponse.json({ error: "El video no existe o no le corresponde." }, { status: 404 });
    }

    const analysis = await getAnalysisForVideo(video.id);
    return NextResponse.json({ video, analysis });
  } catch (error) {
    return serializeError(error);
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/videos/[id]">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    const { id } = await ctx.params;

    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      return NextResponse.json({ error: "El video no existe o no le corresponde." }, { status: 404 });
    }

    const body = await readJsonBody(request, videoPatchSchema);
    const fields: { title?: string; sport?: string } = {};
    if (body.title !== undefined) fields.title = body.title;
    if (body.sport !== undefined) fields.sport = body.sport;

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: "Nada para actualizar." }, { status: 400 });
    }

    await updateVideo(id, fields);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serializeError(error);
  }
}