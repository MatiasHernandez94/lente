import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireApiUser, serializeError } from "@/lib/api";
import { getVideoById, assignVideoToAlumno, getUserById } from "@/lib/repo";
import { listAlumnos } from "@/lib/profile/service";
import { ApiServiceError } from "@/lib/services/videoService";

export interface AsignacionApiResponse {
  userId: string;
  userRol: string;
  assignedAlumnoId: string | null;
  alumnos: Array<{ id: string; name: string; email: string }>;
  assignedAlumnoName: string | null;
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/asignacion">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;

    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no le corresponde.");
    }

    let alumnos: { id: string; name: string; email: string }[] = [];
    let assignedAlumnoName: string | null = null;

    const creator = await getUserById(video.userId);
    if (creator && creator.rol === "profesor") {
      alumnos = await listAlumnos(video.userId);
    }
    if (video.alumnoId) {
      const assigned = await getUserById(video.alumnoId);
      assignedAlumnoName = assigned?.name ?? null;
    }

    const body: AsignacionApiResponse = {
      userId: user.id,
      userRol: creator?.rol ?? "alumno",
      assignedAlumnoId: video.alumnoId,
      alumnos,
      assignedAlumnoName,
    };
    return NextResponse.json(body);
  } catch (error) {
    return serializeError(error);
  }
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/asignacion">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;

    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no le corresponde.");
    }

    const creator = await getUserById(video.userId);
    if (!creator || creator.rol !== "profesor") {
      throw new ApiServiceError(403, "Solo un profesor puede asignar el análisis a un alumno.");
    }

    const body = (await request.json().catch(() => ({}))) as { alumnoId?: string | null };
    const alumnoId = body.alumnoId ?? null;

    if (alumnoId) {
      const alumnos = await listAlumnos(video.userId);
      if (!alumnos.some((a) => a.id === alumnoId)) {
        throw new ApiServiceError(400, "El alumno no está vinculado a este profesor.");
      }
    }

    await assignVideoToAlumno(id, alumnoId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serializeError(error);
  }
}