import { NextRequest, NextResponse } from "next/server";
import { requireApiUser, serializeError } from "@/lib/api";
import { getVideoById, getAnalysisForVideo } from "@/lib/repo";
import { listOKRsForVideo } from "@/lib/okrs/service";
import { generateCoachResponse, type CoachMessage } from "@/lib/ai/coach";
import {
  AIActionError,
  generateCoachChatAnswer,
  getCoachConversation,
  saveCoachConversation,
  getVideoAIInsight,
  type CoachReportVisionResult,
} from "@/lib/ai/video-agent";
import { getSportAnalysis } from "@/lib/sports/service";

async function loadCoachContext(id: string): Promise<{ report: CoachReportVisionResult | null; sportsAnalysis: Record<string, unknown> | null }> {
  const stored = await getVideoAIInsight(id).catch(() => null);
  const storedReport = stored?.coach_report as Partial<CoachReportVisionResult> | undefined;
  const report: CoachReportVisionResult | null = storedReport?.summary
    ? {
        summary: String(storedReport.summary ?? ""),
        positives: Array.isArray(storedReport.positives) ? storedReport.positives : [],
        improvements: Array.isArray(storedReport.improvements) ? storedReport.improvements : [],
        provider: String(storedReport.provider ?? ""),
      }
    : null;
  const sportsAnalysis = (await getSportAnalysis(id).catch(() => null)) as Record<string, unknown> | null;
  return { report, sportsAnalysis };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const conversation = await getCoachConversation(id);
    return NextResponse.json({ messages: conversation?.messages ?? [] });
  } catch (error) {
    return serializeError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const body = await req.json();
    const { message, history: clientHistory = [] } = body as {
      message: string;
      history?: CoachMessage[];
    };

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 });
    }

    const persisted = await getCoachConversation(id);
    const history = persisted?.messages.length
      ? persisted.messages
      : clientHistory.filter((m) => m.role === "user" || m.role === "assistant");

    const analysis = await getAnalysisForVideo(id);
    const okrs = await listOKRsForVideo(id);
    const { report, sportsAnalysis } = await loadCoachContext(id);

    const messages: CoachMessage[] = [...history.filter((m) => m.role === "user" || m.role === "assistant"), { role: "user", content: message }];

    try {
      const response = await generateCoachChatAnswer(video, sportsAnalysis, message, history, report);
      await saveCoachConversation(id, [...messages, { role: "assistant", content: response }]);
      return NextResponse.json({ response });
    } catch (error) {
      if (error instanceof AIActionError && (error.kind === "no_keys" || error.kind === "quota")) {
        const ctx = {
          sport: video.sport,
          analysis: analysis?.result ?? null,
          okrs,
          videoTitle: video.title,
        };
        const fallback = generateCoachResponse(message, ctx);
        await saveCoachConversation(id, [...messages, { role: "assistant", content: fallback }]);
        return NextResponse.json({ response: fallback });
      }
      throw error;
    }
  } catch (error) {
    return serializeError(error);
  }
}