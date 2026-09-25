import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireApiUser, serializeError } from "@/lib/api";
import { getVideoById } from "@/lib/repo";
import { AIActionError, detectSportWithVision, saveVideoAIInsight } from "@/lib/ai/video-agent";
import { ApiServiceError } from "@/lib/services/videoService";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/detectar-deporte">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;

    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no le corresponde.");
    }

    if (!user || user.rol !== "profesor") {
      // Permitimos a cualquier usuario con su propio video, pero la detección
      // de deporte es útil para todos.
    }

    const result = await detectSportWithVision(video);
    await saveVideoAIInsight(video.id, "sport_detection", { ...result, at: new Date().toISOString() });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof AIActionError) {
      return NextResponse.json(
        { error: error.message, kind: error.kind, detail: error.detail ?? null },
        { status: 200 }, // La app responde "no se pudo" sin romper flujo
      );
    }
    return serializeError(error);
  }
}