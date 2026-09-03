import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { getVideoById } from "@/lib/repo";
import { ApiServiceError } from "@/lib/services/videoService";
import {
  chooseExercise,
  getExecutionSnapshot,
  startExecution,
} from "@/lib/execution/service";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/execution">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no corresponde al usuario.");
    }
    return NextResponse.json(await getExecutionSnapshot(video));
  } catch (error) {
    return serializeError(error);
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/execution">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no corresponde al usuario.");
    }
    const body = (await request.json().catch(() => ({}))) as { exerciseId?: string };
    if (!body.exerciseId) {
      throw new ApiServiceError(400, "Se requiere un exerciseId.");
    }
    await startExecution(video, body.exerciseId);
    return NextResponse.json({ status: "running" });
  } catch (error) {
    return serializeError(error);
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/execution">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no corresponde al usuario.");
    }
    const body = (await request.json().catch(() => ({}))) as { exerciseId?: string };
    if (!body.exerciseId) {
      throw new ApiServiceError(400, "Se requiere un exerciseId.");
    }
    await chooseExercise(video, body.exerciseId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serializeError(error);
  }
}
