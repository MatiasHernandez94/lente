import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api";
import { getVideoById, getAnalysisForVideo } from "@/lib/repo";
import { listOKRsForVideo } from "@/lib/okrs/service";
import { generateCoachResponse, type CoachMessage } from "@/lib/ai/coach";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  const { id } = await params;
  const video = await getVideoById(id);
  if (!video || video.userId !== user.id) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const body = await req.json();
  const { message, history = [] } = body as {
    message: string;
    history?: CoachMessage[];
  };

  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 });
  }

  const analysis = await getAnalysisForVideo(id);
  const okrs = await listOKRsForVideo(id);

  const ctx = {
    sport: video.sport,
    analysis: analysis?.result ?? null,
    okrs,
    videoTitle: video.title,
  };

  const response = generateCoachResponse(message, ctx);

  return NextResponse.json({ response });
}
