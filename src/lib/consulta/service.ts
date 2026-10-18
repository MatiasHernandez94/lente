import "server-only";
import { randomUUID } from "node:crypto";
import { getClient } from "@/lib/db";
import type { ConsultaConAutor, ConsultaRow, UserRol } from "@/lib/schema";
import { createNotificacion } from "@/lib/notificacion/service";
import { groupConsultasPendientes, type HiloPendiente } from "./core";

function postError(operation: string, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`${operation}: ${message}`);
}

export interface NewConsultaInput {
  videoId: string;
  alumnoId: string;
  profesorId: string;
  autorId: string;
  autorRol: UserRol;
  mensaje: string;
}

export async function createConsulta(input: NewConsultaInput): Promise<ConsultaRow> {
  const { data, error } = await getClient()
    .from("consultas")
    .insert({
      id: randomUUID(),
      video_id: input.videoId,
      alumno_id: input.alumnoId,
      profesor_id: input.profesorId,
      autor_id: input.autorId,
      autor_rol: input.autorRol,
      mensaje: input.mensaje,
      leida: false,
      created_at: new Date().toISOString(),
    })
    .select("id, video_id, alumno_id, profesor_id, autor_id, autor_rol, mensaje, leida, created_at")
    .single();
  if (error) postError("createConsulta", error);

  await notifyContraparte(input).catch((e) => {
    // No rompe la consulta si la notificación falla.
    console.error("notifyContraparte:", e);
  });

  return parseConsulta(data as ConsultaColumn);
}

/** Avisa a la contraparte del hilo (profesor si escribe el alumno, y viceversa). */
async function notifyContraparte(input: NewConsultaInput): Promise<void> {
  const notifyTargetId = input.autorRol === "alumno" ? input.profesorId : input.alumnoId;
  const accion = input.autorRol === "alumno" ? "te hizo una consulta" : "respondió tu consulta";
  const [autor, video] = await Promise.all([
    getClient().from("users").select("name").eq("id", input.autorId).maybeSingle(),
    getClient().from("videos").select("title").eq("id", input.videoId).maybeSingle(),
  ]);
  const autorName = autor.data?.name ?? (input.autorRol === "alumno" ? "Tu alumno/a" : "Tu profesor/a");
  const videoTitle = video.data?.title ?? "tu video";
  await createNotificacion({
    userId: notifyTargetId,
    tipo: "consulta",
    mensaje: `${autorName} ${accion} sobre "${videoTitle}".`,
    refId: input.videoId,
  });
}

export async function listConsultasByVideo(videoId: string): Promise<ConsultaConAutor[]> {
  const { data, error } = await getClient()
    .from("consultas")
    .select("id, video_id, alumno_id, profesor_id, autor_id, autor_rol, mensaje, leida, created_at")
    .eq("video_id", videoId)
    .order("created_at", { ascending: true });
  if (error) postError("listConsultasByVideo", error);

  const rows = (data ?? []) as ConsultaColumn[];
  const names = await namesByIds([...new Set(rows.map((r) => r.autor_id))]);
  return rows.map((row) => ({ ...parseConsulta(row), autorName: names.get(row.autor_id) ?? "Alguien" }));
}

/**
 * Bandeja del profesor: hilos con al menos un mensaje del alumno sin leer,
 * enriquecidos con el título del video y el nombre del alumno.
 */
export interface HiloPendienteDetalle extends HiloPendiente {
  videoTitle: string;
  alumnoId: string;
  alumnoName: string;
}

export async function listHilosPendientesProfesor(profesorId: string): Promise<HiloPendienteDetalle[]> {
  const { data, error } = await getClient()
    .from("consultas")
    .select("video_id, alumno_id, autor_rol, mensaje, leida, created_at")
    .eq("profesor_id", profesorId)
    .order("created_at", { ascending: true });
  if (error) postError("listHilosPendientesProfesor", error);

  const rows = (data ?? []) as Array<{
    video_id: string;
    alumno_id: string;
    autor_rol: UserRol;
    mensaje: string;
    leida: boolean;
    created_at: string;
  }>;

  const pendientes = groupConsultasPendientes(
    rows.map((r) => ({
      videoId: r.video_id,
      autorRol: r.autor_rol,
      mensaje: r.mensaje,
      leida: r.leida,
      createdAt: r.created_at,
    })),
  );
  if (pendientes.length === 0) return [];

  const alumnoPorVideo = new Map(rows.map((r) => [r.video_id, r.alumno_id] as const));
  const videoIds = [...new Set(pendientes.map((h) => h.videoId))];
  const [titles, names] = await Promise.all([
    videoTitlesByIds(videoIds),
    namesByIds([...new Set(videoIds.map((v) => alumnoPorVideo.get(v)).filter((id): id is string => Boolean(id)))]),
  ]);

  return pendientes.map((h) => {
    const alumnoId = alumnoPorVideo.get(h.videoId) ?? "";
    return {
      ...h,
      videoTitle: titles.get(h.videoId) ?? "Video",
      alumnoId,
      alumnoName: names.get(alumnoId) ?? "Alumno/a",
    };
  });
}

/** Marca como leídos los mensajes que escribió la contraparte del que lee. */
export async function markConsultasLeidas(videoId: string, readerRol: UserRol): Promise<void> {
  const { error } = await getClient()
    .from("consultas")
    .update({ leida: true })
    .eq("video_id", videoId)
    .eq("leida", false)
    .neq("autor_rol", readerRol);
  if (error) postError("markConsultasLeidas", error);
}

async function namesByIds(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await getClient().from("users").select("id, name").in("id", ids);
  if (error) postError("namesByIds", error);
  return new Map((data ?? []).map((u: { id: string; name: string }) => [u.id, u.name] as const));
}

async function videoTitlesByIds(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await getClient().from("videos").select("id, title").in("id", ids);
  if (error) postError("videoTitlesByIds", error);
  return new Map((data ?? []).map((v: { id: string; title: string }) => [v.id, v.title] as const));
}

type ConsultaColumn = {
  id: string;
  video_id: string;
  alumno_id: string;
  profesor_id: string;
  autor_id: string;
  autor_rol: UserRol;
  mensaje: string;
  leida: boolean;
  created_at: string;
};

function parseConsulta(row: ConsultaColumn): ConsultaRow {
  return {
    id: row.id,
    videoId: row.video_id,
    alumnoId: row.alumno_id,
    profesorId: row.profesor_id,
    autorId: row.autor_id,
    autorRol: row.autor_rol,
    mensaje: row.mensaje,
    leida: row.leida,
    createdAt: row.created_at,
  };
}
