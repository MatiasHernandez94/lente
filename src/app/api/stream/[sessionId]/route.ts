import { NextRequest } from "next/server";
import { getStreamSession, sendFrame } from "@/lib/streaming/service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const session = getStreamSession(sessionId);

  if (!session || session.status === "closed") {
    return Response.json({ error: "Sesión no encontrada" }, { status: 404 });
  }

  const body = await req.json();
  const { frameId, image } = body;

  if (!image || typeof frameId !== "number") {
    return Response.json({ error: "frameId e image requeridos" }, { status: 400 });
  }

  // Send frame to Python worker
  sendFrame(sessionId, frameId, image);

  return Response.json({ status: "ok", frameId });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const session = getStreamSession(sessionId);

  if (!session || session.status === "closed") {
    return Response.json({ error: "Sesión no encontrada" }, { status: 404 });
  }

  // Return SSE stream of detections
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let frameCount = 0;
      const interval = setInterval(() => {
        // Send latest detection from buffer
        if (session.frameBuffer.length > 0) {
          const latest = session.frameBuffer[session.frameBuffer.length - 1];
          const data = `data: ${JSON.stringify(latest)}\n\n`;
          controller.enqueue(encoder.encode(data));
          frameCount++;
        }
      }, 50); // 20fps update rate

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
