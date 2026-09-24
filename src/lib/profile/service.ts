import "server-only";
import { randomUUID } from "node:crypto";
import { getClient } from "@/lib/db";
import type { UserRow } from "@/lib/schema";
import { getUserById } from "@/lib/repo";
import type { Deporte, ProfileInput, TutorLink } from "./types";

function postError(operation: string, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`${operation}: ${message}`);
}

function slugify(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseDeporte(row: { id: string; nombre: string; destacado: boolean }): Deporte {
  return { id: row.id, nombre: row.nombre, destacado: row.destacado };
}

const DEPORTE_COLUMNS = "id, nombre, destacado";

export async function listDeportes(): Promise<Deporte[]> {
  const { data, error } = await getClient()
    .from("deportes")
    .select(DEPORTE_COLUMNS)
    .order("destacado", { ascending: false })
    .order("nombre", { ascending: true });
  if (error) postError("listDeportes", error);
  return (data as Array<{ id: string; nombre: string; destacado: boolean }>).map(parseDeporte);
}

export async function ensureDeporte(nombre: string): Promise<Deporte> {
  const trimmed = nombre.trim().replace(/\s+/g, " ");
  const id = slugify(trimmed) || "deporte";
  const { data, error } = await getClient()
    .from("deportes")
    .upsert({ id, nombre: trimmed, destacado: false }, { onConflict: "id" })
    .select(DEPORTE_COLUMNS)
    .single();
  if (error) postError("ensureDeporte", error);
  return parseDeporte(data as { id: string; nombre: string; destacado: boolean });
}

export async function setUserDeportes(userId: string, deporteIds: string[]): Promise<void> {
  const unique = [...new Set(deporteIds)];
  if (unique.length === 0) {
    const { error } = await getClient().from("user_deportes").delete().eq("user_id", userId);
    if (error) postError("setUserDeportes", error);
    return;
  }
  await getClient().from("user_deportes").delete().eq("user_id", userId);
  const { error } = await getClient().from("user_deportes").insert(
    unique.map((deporteId) => ({ user_id: userId, deporte_id: deporteId })),
  );
  if (error) postError("setUserDeportes", error);
}

export async function listUserDeportes(userId: string): Promise<Deporte[]> {
  const { data, error } = await getClient()
    .from("user_deportes")
    .select("deporte_id")
    .eq("user_id", userId);
  if (error) postError("listUserDeportes", error);

  const ids = (data ?? []).map((row: { deporte_id: string }) => row.deporte_id);
  if (ids.length === 0) return [];

  const { data: deportes, error: depError } = await getClient()
    .from("deportes")
    .select(DEPORTE_COLUMNS)
    .in("id", ids);
  if (depError) postError("listUserDeportes", depError);
  return (deportes as Array<{ id: string; nombre: string; destacado: boolean }>)
    .map(parseDeporte)
    .sort((a, b) => (a.destacado === b.destacado ? a.nombre.localeCompare(b.nombre) : a.destacado ? -1 : 1));
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const { data, error } = await getClient()
    .from("users")
    .select(
      "id, name, email, created_at, peso_kg, altura_cm, rol, deporte_docente, tutor_email, terms_accepted, terms_accepted_at",
    )
    .ilike("email", email.trim().toLowerCase())
    .maybeSingle();
  if (error) postError("getUserByEmail", error);
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    createdAt: data.created_at,
    pesoKg: data.peso_kg,
    alturaCm: data.altura_cm,
    rol: data.rol === "profesor" ? "profesor" : "alumno",
    deporteDocente: data.deporte_docente,
    tutorEmail: data.tutor_email,
    termsAccepted: data.terms_accepted,
    termsAcceptedAt: data.terms_accepted_at,
  };
}

export async function linkTutor(alumnoId: string, tutorEmail: string): Promise<boolean> {
  const tutor = await getUserByEmail(tutorEmail);
  if (!tutor || tutor.rol !== "profesor") return false;

  const existing = await getClient()
    .from("profesor_alumno")
    .select("profesor_id")
    .eq("profesor_id", tutor.id)
    .eq("alumno_id", alumnoId)
    .maybeSingle();
  if (existing.error) postError("linkTutor", existing.error);
  if (existing.data) return true;

  const { error } = await getClient()
    .from("profesor_alumno")
    .insert({ profesor_id: tutor.id, alumno_id: alumnoId, created_at: new Date().toISOString() });
  if (error) postError("linkTutor", error);

  const alumno = await getUserById(alumnoId);
  const { error: notifError } = await getClient().from("notificaciones").insert({
    id: randomUUID(),
    user_id: tutor.id,
    tipo: "nuevo_alumno",
    mensaje: `${alumno?.name ?? "Una alumna/o"} te vinculó como su profesor/a.`,
    ref_id: alumnoId,
    leida: false,
    created_at: new Date().toISOString(),
  });
  if (notifError) postError("linkTutor (notificación)", notifError);
  return true;
}

export async function applyPendingTutorLink(alumnoId: string): Promise<boolean> {
  const alumno = await getUserById(alumnoId);
  if (!alumno || alumno.rol !== "alumno" || !alumno.tutorEmail) return false;
  return linkTutor(alumnoId, alumno.tutorEmail);
}

export async function listTutors(alumnoId: string): Promise<TutorLink[]> {
  const { data, error } = await getClient()
    .from("profesor_alumno")
    .select("profesor_id, created_at")
    .eq("alumno_id", alumnoId);
  if (error) postError("listTutors", error);

  const rows = data ?? [];
  const ids = rows.map((row: { profesor_id: string }) => row.profesor_id);
  if (ids.length === 0) return [];

  const { data: profesores, error: profError } = await getClient()
    .from("users")
    .select("id, name, email, deporte_docente")
    .in("id", ids);
  if (profError) postError("listTutors", profError);
  const byId = new Map(
    (profesores as Array<{ id: string; name: string; email: string; deporte_docente: string | null }>).map(
      (p) => [p.id, p] as const,
    ),
  );
  return rows.map((row: { profesor_id: string; created_at: string }) => ({
    profesor: {
      id: row.profesor_id,
      name: byId.get(row.profesor_id)?.name ?? "Sin nombre",
      email: byId.get(row.profesor_id)?.email ?? "",
      deporteDocente: byId.get(row.profesor_id)?.deporte_docente ?? null,
    },
    createdAt: row.created_at,
  }));
}

export async function listAlumnos(profesorId: string): Promise<{ id: string; name: string; email: string }[]> {
  const { data, error } = await getClient()
    .from("profesor_alumno")
    .select("alumno_id")
    .eq("profesor_id", profesorId);
  if (error) postError("listAlumnos", error);

  const ids = (data ?? []).map((row: { alumno_id: string }) => row.alumno_id);
  if (ids.length === 0) return [];

  const { data: alumnos, error: alumError } = await getClient()
    .from("users")
    .select("id, name, email")
    .in("id", ids);
  if (alumError) postError("listAlumnos", alumError);
  return (alumnos as Array<{ id: string; name: string; email: string }>).map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
  }));
}

export async function isAlumnoOf(profesorId: string, alumnoId: string): Promise<boolean> {
  const { data, error } = await getClient()
    .from("profesor_alumno")
    .select("alumno_id")
    .eq("profesor_id", profesorId)
    .eq("alumno_id", alumnoId)
    .maybeSingle();
  if (error) postError("isAlumnoOf", error);
  return Boolean(data);
}

export async function listAlumnosConDetalle(
  profesorId: string,
): Promise<Array<{ id: string; name: string; email: string; videoCount: number }>> {
  const alumnos = await listAlumnos(profesorId);
  const results: Array<{ id: string; name: string; email: string; videoCount: number }> = [];
  for (const alumno of alumnos) {
    const { count, error } = await getClient()
      .from("videos")
      .select("id", { count: "exact", head: true })
      .eq("user_id", alumno.id);
    if (error) postError("listAlumnosConDetalle", error);
    results.push({ ...alumno, videoCount: count ?? 0 });
  }
  return results;
}

export async function updateProfile(userId: string, input: ProfileInput): Promise<void> {
  const update: Record<string, unknown> = {};
  if (input.pesoKg !== undefined) update.peso_kg = input.pesoKg;
  if (input.alturaCm !== undefined) update.altura_cm = input.alturaCm;
  if (input.rol !== undefined) update.rol = input.rol;
  if (input.deporteDocente !== undefined) update.deporte_docente = input.deporteDocente;
  if (input.tutorEmail !== undefined) update.tutor_email = input.tutorEmail;
  if (input.termsAccepted !== undefined) {
    update.terms_accepted = input.termsAccepted;
    update.terms_accepted_at = input.termsAccepted ? input.termsAcceptedAt ?? new Date().toISOString() : null;
  }
  if (Object.keys(update).length === 0) return;

  const { error } = await getClient().from("users").update(update).eq("id", userId);
  if (error) postError("updateProfile", error);
}

export async function deleteUserById(userId: string): Promise<void> {
  const admin = getClient();
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) postError("deleteUser (auth)", authError);
  const { error } = await getClient().from("users").delete().eq("id", userId);
  if (error) postError("deleteUser", error);
}