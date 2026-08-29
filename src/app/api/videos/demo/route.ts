import { NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { createDemoExamples } from "@/lib/services/videoService";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    const videos = createDemoExamples(user.id);
    return NextResponse.json({ videos }, { status: 201 });
  } catch (error) {
    return serializeError(error);
  }
}