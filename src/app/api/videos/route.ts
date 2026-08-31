import { NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { createPendingVideo, listUserVideos } from "@/lib/services/videoService";
import { createVideoSchema } from "@/lib/validation";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    return NextResponse.json({ videos: await listUserVideos(user.id) });
  } catch (error) {
    return serializeError(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);

    const body = await request.json().catch(() => null);
    const parsed = createVideoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos de video no válidos.", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { title, sport, sourceType, sourceRef, durationSeconds, players } = parsed.data;

    if ((sourceType === "camera" || sourceType === "upload") && !sourceRef) {
      return NextResponse.json(
        { error: "Debe subir el archivo antes de registrar el video." },
        { status: 400 },
      );
    }
    if (sourceType === "youtube" && !sourceRef?.match(/^https?:\/\/(www\.)?youtu(\.be|be\.com)\//)) {
      return NextResponse.json({ error: "La URL de YouTube no es válida." }, { status: 400 });
    }

    const video = await createPendingVideo({
      userId: user.id,
      title,
      sport,
      sourceType,
      sourceRef: sourceRef ?? null,
      durationSeconds,
      players,
    });

    return NextResponse.json({ video }, { status: 201 });
  } catch (error) {
    return serializeError(error);
  }
}