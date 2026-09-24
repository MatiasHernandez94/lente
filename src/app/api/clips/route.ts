import { NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { getVideoById } from "@/lib/repo";
import { isAlumnoOf } from "@/lib/profile/service";
import { resolveClipRange, extractClip, uploadClip } from "@/lib/clip/service";
import { getClient } from "@/lib/db";

export const maxDuration = 60;

interface ClipRequest {
  correccionId: string;
}

interface CorreccionRow {
  id: string;
  video_id: string;
  minuto_inicio: number | null;
  minuto_fin: number | null;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);

    const body = (await request.json().catch(() => null)) as ClipRequest | null;
    if (!body || typeof body.correccionId !== "string" || !body.correccionId) {
      return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
    }

    const { data: correccion, error: correccionError } = await getClient()
      .from("correcciones")
      .select("id, video_id, minuto_inicio, minuto_fin")
      .eq("id", body.correccionId)
      .maybeSingle<CorreccionRow>();
    if (correccionError || !correccion) {
      return NextResponse.json({ error: "Corrección no encontrada." }, { status: 404 });
    }
    if (correccion.minuto_inicio === null) {
      return NextResponse.json({ error: "La corrección no tiene un minuto de referencia." }, { status: 400 });
    }

    const video = await getVideoById(correccion.video_id);
    if (!video) {
      return NextResponse.json({ error: "Video no encontrado." }, { status: 404 });
    }

    const isOwner = video.userId === user.id;
    const isProfesor = user.rol === "profesor" ? await isAlumnoOf(user.id, video.userId) : false;
    if (!isOwner && !isProfesor) {
      return NextResponse.json({ error: "No tiene permiso sobre este video." }, { status: 403 });
    }

    const { start, duration } = resolveClipRange(video, correccion.minuto_inicio, correccion.minuto_fin);
    const buffer = await extractClip(video, start, duration);
    const clipUrl = await uploadClip(buffer, "video/mp4");

    const { error: updateError } = await getClient()
      .from("correcciones")
      .update({ clip_url: clipUrl })
      .eq("id", correccion.id);
    if (updateError) {
      return NextResponse.json({ error: "El clip se generó pero no pudo guardarse en la corrección." }, { status: 500 });
    }

    return NextResponse.json({ clipUrl, start, duration });
  } catch (error) {
    return serializeError(error);
  }
}