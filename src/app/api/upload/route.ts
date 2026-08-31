import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { createVideoUploadUrl } from "@/lib/storage";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireApiUser();
    assertSameOrigin(request);

    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const name = body.name ?? "video.mp4";
    const extension = (name.split(".").pop() ?? "mp4").toLowerCase();
    if (!["mp4", "webm", "mov"].includes(extension)) {
      return NextResponse.json(
        { error: "Formato de video no admitido. Use MP4, WebM o MOV." },
        { status: 415 },
      );
    }

    const videoId = randomUUID();
    const { path, url } = await createVideoUploadUrl(videoId, `.${extension}`);
    return NextResponse.json({ videoId, path, uploadUrl: url });
  } catch (error) {
    return serializeError(error);
  }
}
