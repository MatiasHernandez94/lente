import "server-only";
import { randomUUID } from "node:crypto";
import { getClient } from "@/lib/db";
import type { CorreccionConProfesor, CorreccionRow } from "@/lib/schema";

function postError(operation: string, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`${operation}: ${message}`);
}

export interface NewCorreccionInput {
  videoId: string;
  profesorId: string;
  alumnoId: string;
  mensaje: string;
  minutoInicio?: number | null;
  minutoFin?: number | null;
}

export async function createCorreccion(input: NewCorreccionInput): Promise<CorreccionRow> {
  const { data, error } = await getClient()
    .from("correcciones")
    .insert({
      id: randomUUID(),
      video_id: input.videoId,
      profesor_id: input.profesorId,
      alumno_id: input.alumnoId,
      mensaje: input.mensaje,
      minuto_inicio: input.minutoInicio ?? null,
      minuto_fin: input.minutoFin ?? null,
      created_at: new Date().toISOString(),
    })
    .select("id, video_id, profesor_id, alumno_id, mensaje, minuto_inicio, minuto_fin, clip_url, created_at")
    .single();
  if (error) postError("createCorreccion", error);
  return parseCorreccion(data as CorreccionColumn);
}

export async function listCorreccionesByVideo(videoId: string): Promise<CorreccionConProfesor[]> {
  const { data, error } = await getClient()
    .from("correcciones")
    .select(
      "id, video_id, profesor_id, alumno_id, mensaje, minuto_inicio, minuto_fin, clip_url, created_at, users!correcciones_profesor_id_fkey(name)",
    )
    .eq("video_id", videoId)
    .order("created_at", { ascending: false });
  if (error) postError("listCorreccionesByVideo", error);

  const rows = data ?? [];
  return rows.map((row) => {
    const parsed = parseCorreccion(row);
    return {
      ...parsed,
      profesorName: (row.users as { name?: string } | undefined)?.name ?? "Profesor",
    };
  });
}

export interface CorreccionParaAlumno extends CorreccionConProfesor {
  videoTitle: string;
}

export async function listCorreccionesByAlumno(alumnoId: string): Promise<CorreccionParaAlumno[]> {
  const { data, error } = await getClient()
    .from("correcciones")
    .select(
      "id, video_id, profesor_id, alumno_id, mensaje, minuto_inicio, minuto_fin, clip_url, created_at, users!correcciones_profesor_id_fkey(name), videos(title)",
    )
    .eq("alumno_id", alumnoId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) postError("listCorreccionesByAlumno", error);

  const rows = data ?? [];
  return rows.map((row) => {
    const parsed = parseCorreccion(row);
    return {
      ...parsed,
      profesorName: (row.users as { name?: string } | undefined)?.name ?? "Profesor",
      videoTitle: (row.videos as { title?: string } | undefined)?.title ?? "Video",
    };
  });
}

export async function deleteCorreccion(id: string): Promise<void> {
  const { error } = await getClient().from("correcciones").delete().eq("id", id);
  if (error) postError("deleteCorreccion", error);
}

type CorreccionColumn = {
  id: string;
  video_id: string;
  profesor_id: string;
  alumno_id: string;
  mensaje: string;
  minuto_inicio: number | null;
  minuto_fin: number | null;
  clip_url: string | null;
  created_at: string;
};

function parseCorreccion(row: CorreccionColumn): CorreccionRow {
  return {
    id: row.id,
    videoId: row.video_id,
    profesorId: row.profesor_id,
    alumnoId: row.alumno_id,
    mensaje: row.mensaje,
    minutoInicio: row.minuto_inicio,
    minutoFin: row.minuto_fin,
    clipUrl: row.clip_url,
    createdAt: row.created_at,
  };
}