import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireApiUser, serializeError } from "@/lib/api";
import { getAnalysisForVideo, getVideoById, updateVideo } from "@/lib/repo";

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
    const { id } = await ctx.params;

    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      return NextResponse.json({ error: "El video no existe o no le corresponde." }, { status: 404 });
    }

    const body = (await request.json()) as { title?: string; sport?: string };
    const fields: { title?: string; sport?: string } = {};
    if (typeof body.title === "string" && body.title.trim().length >= 3) fields.title = body.title.trim().slice(0, 120);
    if (typeof body.sport === "string") fields.sport = body.sport;

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: "Nada para actualizar." }, { status: 400 });
    }

    await updateVideo(id, fields);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serializeError(error);
  }
}