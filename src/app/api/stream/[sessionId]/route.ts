import { NextRequest } from "next/server";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { getStreamSession, sendFrame } from "@/lib/streaming/service";
import { getVideoById } from "@/lib/repo";
import { readJsonBody, streamFrameSchema } from "@/lib/validation/api";

/**
 * La sesión es de un video con dueño: sin esta comprobación cualquier persona
 * con el sessionId (y sin sesión iniciada) podía empujar frames al worker de
 * Python y leer las detecciones.
 */
async function requireSessionOwner(sessionId: string) {
  const user = await requireApiUser();
  const session = getStreamSession(sessionId);
  if (!session || session.status === "closed") {
    return null;
  }
  const video = await getVideoById(session.videoId);
  if (!video || video.userId !== user.id) {
    return null;
  }
  return { user, session };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    assertSameOrigin(req);
    const owner = await requireSessionOwner(sessionId);
    if (!owner) {
      return Response.json({ error: "Sesión no encontrada" }, { status: 404 });
    }

    const { frameId, image } = await readJsonBody(req, streamFrameSchema);
    sendFrame(sessionId, frameId, image);

    return Response.json({ status: "ok", frameId });
  } catch (error) {
    return serializeError(error);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const owner = await requireSessionOwner(sessionId);
    if (!owner) {
      return Response.json({ error: "Sesión no encontrada" }, { status: 404 });
    }

    // Return SSE stream of detections
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const interval = setInterval(() => {
          // Send latest detection from buffer
          if (owner.session.frameBuffer.length > 0) {
            const latest = owner.session.frameBuffer[owner.session.frameBuffer.length - 1];
            const data = `data: ${JSON.stringify(latest)}\n\n`;
            controller.enqueue(encoder.encode(data));
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
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return serializeError(error);
  }
}
