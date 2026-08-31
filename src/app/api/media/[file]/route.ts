import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireApiUser, serializeError } from "@/lib/api";
import { getSignedVideoUrl } from "@/lib/storage";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/media/[file]">): Promise<NextResponse> {
  try {
    await requireApiUser();
    const { file } = await ctx.params;

    const path = decodeURIComponent(file);
    if (!path.startsWith("uploads/") || !/\.(mp4|webm|mov)$/i.test(path)) {
      return NextResponse.json({ error: "Recurso no encontrado." }, { status: 404 });
    }

    const signedUrl = await getSignedVideoUrl(path);
    if (!signedUrl) {
      return NextResponse.json({ error: "Recurso no encontrado." }, { status: 404 });
    }

    return NextResponse.redirect(signedUrl, 302);
  } catch (error) {
    return serializeError(error);
  }
}
