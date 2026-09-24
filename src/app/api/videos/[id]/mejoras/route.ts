import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireApiUser, serializeError } from "@/lib/api";
import { getVideoById } from "@/lib/repo";
import { getSportAnalysis } from "@/lib/sports/service";
import {
  AIActionError,
  generateImprovementsWithVision,
  getVideoAIInsight,
  saveVideoAIInsight,
} from "@/lib/ai/video-agent";
import { ApiServiceError } from "@/lib/services/videoService";

export interface ImprovementsApiResponse {
  summary: string;
  improvements: Array<{
    title: string;
    detail: string;
    priority: "alta" | "media" | "baja";
    referenceToMetric?: string;
  }>;
  playerCount: number;
  provider: string;
  cached: boolean;
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/mejoras">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;

    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no le corresponde.");
    }
    if (video.sourceType === "youtube") {
      throw new ApiServiceError(400, "El agente de mejoras requiere el video local; no está disponible para videos de YouTube.");
    }

    const analysis = await getSportAnalysis(id);
    const result = await generateImprovementsWithVision(video, analysis as unknown as Record<string, unknown>);
    await saveVideoAIInsight(video.id, "improvements", { ...result, at: new Date().toISOString() });

    const body: ImprovementsApiResponse = { ...result, cached: false };
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof AIActionError) {
      return NextResponse.json(
        { error: error.message, kind: error.kind, detail: error.detail ?? null },
        { status: 200 },
      );
    }
    return serializeError(error);
  }
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/mejoras">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;

    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no le corresponde.");
    }

    const stored = await getVideoAIInsight(id);
    const improvements = stored?.improvements;
    if (improvements) {
      const body: ImprovementsApiResponse = {
        summary: String(improvements.summary ?? ""),
        improvements: (Array.isArray(improvements.improvements) ? improvements.improvements : []).map(
          (item) => ({
            title: String(item?.title ?? ""),
            detail: String(item?.detail ?? ""),
            priority: item?.priority === "alta" || item?.priority === "media" || item?.priority === "baja" ? item.priority : "media",
            referenceToMetric: item?.referenceToMetric ? String(item.referenceToMetric) : undefined,
          }),
        ),
        playerCount: Number(improvements.playerCount ?? 0),
        provider: String(improvements.provider ?? ""),
        cached: true,
      };
      return NextResponse.json(body);
    }

    return NextResponse.json({ status: "none" });
  } catch (error) {
    return serializeError(error);
  }
}