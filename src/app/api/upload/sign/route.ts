import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { createVideoSignedUploadUrl } from "@/lib/videos/storage";

const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;
const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"];

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireApiUser();
    assertSameOrigin(request);

    const body = (await request.json()) as { fileName?: string; size?: number };
    const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
    const extension = extname(fileName).toLowerCase();

    if (!fileName) {
      return NextResponse.json({ error: "Debe indicar el nombre del archivo." }, { status: 400 });
    }
    if (!ALLOWED_VIDEO_EXTENSIONS.includes(extension)) {
      return NextResponse.json(
        { error: "Este formato no es reproducible en navegadores. Use MP4, WebM o MOV." },
        { status: 415 },
      );
    }
    if (typeof body.size === "number" && body.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "El video supera el límite de 250 MB." }, { status: 413 });
    }

    const ref = `${randomUUID()}${extension}`;
    const signed = await createVideoSignedUploadUrl(ref);
    if (!signed) {
      return NextResponse.json(
        { error: "El almacenamiento de video no está disponible. Intentá de nuevo." },
        { status: 503 },
      );
    }

    return NextResponse.json({ file: ref, uploadUrl: signed.signedUrl, path: `video/${ref}`, token: signed.token });
  } catch (error) {
    return serializeError(error);
  }
}