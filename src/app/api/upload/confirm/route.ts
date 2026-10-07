import { NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { mirrorVideoToLocal } from "@/lib/videos/storage";
import { readJsonBody, uploadConfirmSchema } from "@/lib/validation/api";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireApiUser();
    assertSameOrigin(request);

    const { file } = await readJsonBody(request, uploadConfirmSchema);

    // Best effort: baja el video a data/uploads (útil en dev para el análisis completo).
    await mirrorVideoToLocal(file);

    return NextResponse.json({ file, ok: true });
  } catch (error) {
    return serializeError(error);
  }
}