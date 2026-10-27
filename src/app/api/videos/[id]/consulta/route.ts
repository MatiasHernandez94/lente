import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { getVideoById, getUserById } from "@/lib/repo";
import { isAlumnoOf, listTutors } from "@/lib/profile/service";
import {
  createConsulta,
  listConsultasByVideo,
  markConsultasLeidas,
} from "@/lib/consulta/service";
import { resolveProfesorId } from "@/lib/consulta/core";
import type { UserRol } from "@/lib/schema";

/**
 * Resuelve el rol del usuario en el contexto de este video:
 *   - "alumno"   → es el dueño del video.
 *   - "profesor" → está vinculado al dueño vía `profesor_alumno`.
 * Cualquier otro caso devuelve null (sin acceso).
 */
async function resolveParticipante(
  userId: string,
  videoOwnerId: string,
): Promise<UserRol | null> {
  if (userId === videoOwnerId) return "alumno";
  if (await isAlumnoOf(userId, videoOwnerId)) return "profesor";
  return null;
}

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/videos/[id]/consulta">,
): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;

    const video = await getVideoById(id);
    if (!video) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const rol = await resolveParticipante(user.id, video.userId);
    if (!rol) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    // Al abrir el hilo queda leído para quien mira, no para quien escribió.
    await markConsultasLeidas(id, rol);

    const messages = await listConsultasByVideo(id);

    // Nombre de la contraparte, para el encabezado del panel de chat.
    let contraparteName: string;
    if (rol === "profesor") {
      contraparteName = (await getUserById(video.userId))?.name ?? "Alumno/a";
    } else {
      contraparteName = (await resolveProfesorDe(user.id))?.name ?? "Profesor";
    }

    return NextResponse.json({
      role: rol,
      contraparteName,
      messages: messages.map((m) => ({
        id: m.id,
        autorRol: m.autorRol,
        autorName: m.autorName,
        mensaje: m.mensaje,
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    return serializeError(error);
  }
}

async function resolveProfesorDe(alumnoId: string): Promise<{ id: string; name: string } | null> {
  const tutores = await listTutors(alumnoId);
  const id = resolveProfesorId(tutores.map((t) => ({ id: t.profesor.id, name: t.profesor.name })));
  if (!id) return null;
  const tutor = tutores.find((t) => t.profesor.id === id);
  return tutor ? { id, name: tutor.profesor.name } : { id, name: "Profesor" };
}

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/videos/[id]/consulta">,
): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    const { id } = await ctx.params;

    const video = await getVideoById(id);
    if (!video) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const rol = await resolveParticipante(user.id, video.userId);
    if (!rol) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const body = (await request.json()) as { message?: unknown };
    const mensaje = typeof body.message === "string" ? body.message.trim() : "";
    if (!mensaje) return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 });
    if (mensaje.length > 2000) {
      return NextResponse.json({ error: "El mensaje es demasiado largo." }, { status: 400 });
    }

    const alumnoId = video.userId;
    let profesorId: string;

    if (rol === "profesor") {
      profesorId = user.id;
    } else {
      const tutor = await resolveProfesorDe(user.id);
      if (!tutor) {
        return NextResponse.json(
          { error: "No tenés un profesor vinculado todavía. Pedile a tu profesor/a que te agregue." },
          { status: 400 },
        );
      }
      profesorId = tutor.id;
    }

    const consulta = await createConsulta({
      videoId: id,
      alumnoId,
      profesorId,
      autorId: user.id,
      autorRol: rol,
      mensaje,
    });

    return NextResponse.json({ message: consulta });
  } catch (error) {
    return serializeError(error);
  }
}
