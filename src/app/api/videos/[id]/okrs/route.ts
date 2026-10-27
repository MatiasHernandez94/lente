import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { readJsonBody, okrCreateSchema } from "@/lib/validation/api";
import { getVideoById } from "@/lib/repo";
import { createOKR, listOKRsForVideo } from "@/lib/okrs/service";
import { suggestOKRs } from "@/lib/okrs/engine";
import { getAnalysisForVideo } from "@/lib/repo";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  const { id } = await params;
  const video = await getVideoById(id);
  if (!video || video.userId !== user.id) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const okrs = await listOKRsForVideo(id);

  // Get suggestions based on analysis
  const analysis = await getAnalysisForVideo(id);
  let suggestions: ReturnType<typeof suggestOKRs> = [];
  if (analysis) {
    suggestions = suggestOKRs(video.sport, {
      score: analysis.score,
      metrics: analysis.result.metrics,
    });
  }

  return NextResponse.json({ okrs, suggestions });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    assertSameOrigin(req);
    const { id } = await params;
    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const { title, objective, keyResults } = await readJsonBody(req, okrCreateSchema);

    const okr = await createOKR({
      videoId: id,
      userId: user.id,
      title,
      objective,
      keyResults,
    });

    return NextResponse.json({ okr });
  } catch (error) {
    return serializeError(error);
  }
}
