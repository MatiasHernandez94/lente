import { NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { mirrorVideoToLocal } from "@/lib/videos/storage";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireApiUser();
    assertSameOrigin(request);

    const body = (await request.json()) as { file?: string };
    const file = typeof body.file === "string" ? body.file.trim() : "";

    if (!file) {
      return NextResponse.json({ error: "Debe indicar el archivo." }, { status: 400 });
    }

    // Best effort: baja el video a data/uploads (útil en dev para el análisis completo).
    await mirrorVideoToLocal(file);

    return NextResponse.json({ file, ok: true });
  } catch (error) {
    return serializeError(error);
  }
}