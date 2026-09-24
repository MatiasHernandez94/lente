import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { join, extname } from "node:path";
import { requireApiUser, serializeError } from "@/lib/api";
import { resolveVideoSource } from "@/lib/videos/storage";

const UPLOADS_DIR = join(process.cwd(), "data", "uploads");
const SAFE_NAME = /^[0-9a-f-]{36}\.(mp4|mov|webm)$/;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/media/[file]">): Promise<NextResponse> {
  try {
    await requireApiUser();
    const { file } = await ctx.params;

    if (!SAFE_NAME.test(file)) {
      return NextResponse.json({ error: "Recurso no encontrado." }, { status: 404 });
    }

    const filePath = join(UPLOADS_DIR, file);
    const fileStat = await stat(filePath).catch(() => null);
    if (fileStat) {
      const mime = MIME_BY_EXTENSION[extname(file).toLowerCase()] ?? "application/octet-stream";
      const stream = Readable.toWeb(createReadStream(filePath));
      return new NextResponse(stream as unknown as BodyInit, {
        headers: {
          "Content-Type": mime,
          "Content-Length": String(fileStat.size),
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    // En producción el archivo está en Supabase Storage: redirigimos a una URL firmada.
    const resolved = await resolveVideoSource(file, { localDir: UPLOADS_DIR });
    if (resolved.streamUrl) {
      return NextResponse.redirect(resolved.streamUrl);
    }

    return NextResponse.json(
      { error: "El archivo de video no está disponible en este entorno." },
      { status: 404 },
    );
  } catch (error) {
    return serializeError(error);
  }
}
