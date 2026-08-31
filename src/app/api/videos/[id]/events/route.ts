import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { getVideoById } from "@/lib/repo";
import { createVideoEvent, listVideoEvents } from "@/lib/repo";
import { ApiServiceError } from "@/lib/services/videoService";
import { courtBounds, EVENT_TYPES_BY_SPORT } from "@/lib/events/meta";
import type { EventType, EventsTeam } from "@/lib/events/meta";

const eventSchema = z.object({
  team: z.enum(["A", "B"]),
  player: z.string().trim().max(60).optional().default(""),
  eventType: z.enum([
    "made",
    "missed",
    "assist",
    "rebound",
    "turnover",
    "foul",
    "pause",
  ]),
  x: z.number(),
  y: z.number(),
  t: z.number().finite().nonnegative(),
  points: z.union([z.literal(2), z.literal(3)]).nullable().optional().default(null),
});

export async function GET(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/events">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no corresponde al usuario.");
    }
    return NextResponse.json({ events: await listVideoEvents(video.id) });
  } catch (error) {
    return serializeError(error);
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/events">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no corresponde al usuario.");
    }

    const parsed = eventSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiServiceError(400, "Datos del evento no válidos.");
    }
    const input = parsed.data;
    if (!EVENT_TYPES_BY_SPORT[video.sport].includes(input.eventType as EventType)) {
      throw new ApiServiceError(400, "Tipo de evento no permitido para este deporte.");
    }
    const bounds = courtBounds(video.sport);
    if (input.x < 0 || input.x > bounds.width || input.y < 0 || input.y > bounds.height) {
      throw new ApiServiceError(400, "El punto está fuera de la cancha.");
    }
    if (video.durationSeconds !== null && input.t > video.durationSeconds + 2) {
      throw new ApiServiceError(400, "El tiempo supera la duración del video.");
    }

    const event = {
      id: randomUUID(),
      videoId: video.id,
      team: input.team as EventsTeam,
      player: input.player,
      eventType: input.eventType as EventType,
      x: input.x,
      y: input.y,
      t: input.t,
      points: input.points,
      createdAt: new Date().toISOString(),
    };
    await createVideoEvent(event);
    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    return serializeError(error);
  }
}