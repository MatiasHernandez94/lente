import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api";
import { getVideoById } from "@/lib/repo";
import { createStreamSession, closeStreamSession } from "@/lib/streaming/service";

const sessionMap = new Map<string, string>(); // userId -> sessionId

export async function POST(req: NextRequest) {
  const user = await requireApiUser();

  const body = await req.json();
  const { action, videoId } = body;

  if (!videoId) {
    return NextResponse.json({ error: "videoId requerido" }, { status: 400 });
  }

  const video = await getVideoById(videoId);
  if (!video || video.userId !== user.id) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  if (action === "start") {
    // Close existing session if any
    const existingSessionId = sessionMap.get(user.id);
    if (existingSessionId) {
      closeStreamSession(existingSessionId);
    }

    const session = createStreamSession(videoId);
    sessionMap.set(user.id, session.id);

    // Wait for worker to be ready (max 5 seconds)
    let attempts = 0;
    while (session.status === "starting" && attempts < 50) {
      await new Promise((r) => setTimeout(r, 100));
      attempts++;
    }

    if (session.status !== "ready") {
      return NextResponse.json({ error: "Worker no disponible" }, { status: 500 });
    }

    return NextResponse.json({ sessionId: session.id, status: "ready" });
  }

  if (action === "stop") {
    const sessionId = sessionMap.get(user.id);
    if (sessionId) {
      closeStreamSession(sessionId);
      sessionMap.delete(user.id);
    }
    return NextResponse.json({ status: "stopped" });
  }

  return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
}
