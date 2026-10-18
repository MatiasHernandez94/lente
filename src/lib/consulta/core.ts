import type { UserRol } from "@/lib/schema";

/**
 * Referencia mínima de un tutor para decidir con quién se abre el hilo.
 */
export interface TutorRef {
  id: string;
  name: string;
}

/**
 * Elige el profesor con el que se abre un hilo nuevo.
 *
 * El alumno puede tener varios tutores, pero el hilo es uno solo por video. En
 * vez de elegir "al azar" según el orden en que la base devuelva las filas (que
 * no está garantizado), se ordena por id para que dos llamadas seguidas elijan
 * siempre al mismo profesor.
 *
 * Sin tutores no hay a quién preguntar: devuelve null y quien llama avisa.
 */
export function resolveProfesorId(tutores: TutorRef[]): string | null {
  if (tutores.length === 0) return null;
  return [...tutores].sort((a, b) => a.id.localeCompare(b.id))[0].id;
}

export interface ConsultaMensajePlano {
  videoId: string;
  leida: boolean;
  autorRol: UserRol;
  mensaje: string;
  createdAt: string;
}

export interface HiloPendiente {
  videoId: string;
  unreadCount: number;
  lastAt: string;
  lastMessage: string;
  lastAutorRol: UserRol;
}

/**
 * Agrupa mensajes sueltos en hilos por video, para la bandeja del profesor.
 *
 * Solo cuenta como pendiente lo que escribió el alumno y todavía no se leyó: la
 * propia respuesta del profesor no debería reabrir el hilo. Se ordena por el
 * último mensaje, así lo más reciente queda arriba.
 */
export function groupConsultasPendientes(mensajes: ConsultaMensajePlano[]): HiloPendiente[] {
  const porVideo = new Map<string, HiloPendiente>();

  for (const m of mensajes) {
    const existente = porVideo.get(m.videoId);
    if (!existente) {
      porVideo.set(m.videoId, {
        videoId: m.videoId,
        unreadCount: !m.leida && m.autorRol === "alumno" ? 1 : 0,
        lastAt: m.createdAt,
        lastMessage: m.mensaje,
        lastAutorRol: m.autorRol,
      });
      continue;
    }
    if (!m.leida && m.autorRol === "alumno") existente.unreadCount += 1;
    if (m.createdAt > existente.lastAt) {
      existente.lastAt = m.createdAt;
      existente.lastMessage = m.mensaje;
      existente.lastAutorRol = m.autorRol;
    }
  }

  return [...porVideo.values()]
    .filter((hilo) => hilo.unreadCount > 0)
    .sort((a, b) => (a.lastAt === b.lastAt ? 0 : a.lastAt < b.lastAt ? 1 : -1));
}
