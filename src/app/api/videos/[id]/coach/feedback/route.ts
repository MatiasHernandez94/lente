import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireApiUser, assertSameOrigin, serializeError } from "@/lib/api";
import { getVideoById } from "@/lib/repo";
import { getSportAnalysis } from "@/lib/sports/service";
import { getVideoAIInsight, saveUserFeedback } from "@/lib/ai/video-agent";
import { ApiServiceError } from "@/lib/services/videoService";

/**
 * Feedback del usuario sobre la corrección prioritaria del coach.
 *
 * Es la señal que alimenta el bucle de auto-aprendizaje: un pulgar arriba fija
 * el ajuste, uno abajo lo guarda como restricción ("no repitas esto"). Sin esta
 * señal el agente no tiene forma de saber si acertó.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/coach/feedback">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    const { id } = await ctx.params;

    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no le corresponde.");
    }

    const body = (await request.json()) as {
      helpful?: boolean;
      correction?: string;
    };

    if (typeof body.helpful !== "boolean") {
      return NextResponse.json({ error: "Indicá si la corrección te sirvió." }, { status: 400 });
    }

    const stored = await getVideoAIInsight(id).catch(() => null);
    const audit = stored?.motor_audit as
      | { error_type?: string; critical_fix?: { title?: string; detail?: string; cue?: string } }
      | undefined;
    const fix = audit?.critical_fix;

    if (!fix?.title) {
      return NextResponse.json(
        { error: "Todavía no hay una corrección generada para este video." },
        { status: 409 },
      );
    }

    const sport = (video.sport ?? "general") as Parameters<typeof saveUserFeedback>[0]["sport"];

    const learning = await saveUserFeedback({
      userId: user.id,
      videoId: id,
      sport,
      errorType: audit?.error_type ?? null,
      recommendation: `${fix.title}. ${fix.detail ?? ""}`.trim(),
      helpful: body.helpful,
      correction: body.correction,
    });

    if (!learning) {
      return NextResponse.json({ error: "No se pudo guardar el feedback." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, learning: { id: learning.id, origen: learning.origen } });
  } catch (error) {
    return serializeError(error);
  }
}
