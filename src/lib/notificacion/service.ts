import "server-only";
import { randomUUID } from "node:crypto";
import { getClient } from "@/lib/db";

function postError(operation: string, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`${operation}: ${message}`);
}

export interface NewNotificacionInput {
  userId: string;
  tipo: string;
  mensaje: string;
  refId?: string | null;
}

export async function createNotificacion(input: NewNotificacionInput): Promise<void> {
  const { error } = await getClient().from("notificaciones").insert({
    id: randomUUID(),
    user_id: input.userId,
    tipo: input.tipo,
    mensaje: input.mensaje,
    ref_id: input.refId ?? null,
    leida: false,
    created_at: new Date().toISOString(),
  });
  if (error) postError("createNotificacion", error);
}

export interface NotificacionRow {
  id: string;
  userId: string;
  tipo: string;
  mensaje: string;
  refId: string | null;
  leida: boolean;
  createdAt: string;
}

export async function countUnreadNotificaciones(userId: string): Promise<number> {
  const { count, error } = await getClient()
    .from("notificaciones")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("leida", false);
  if (error) postError("countUnreadNotificaciones", error);
  return count ?? 0;
}

export async function listNotificaciones(userId: string): Promise<NotificacionRow[]> {
  const { data, error } = await getClient()
    .from("notificaciones")
    .select("id, user_id, tipo, mensaje, ref_id, leida, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) postError("listNotificaciones", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    tipo: row.tipo,
    mensaje: row.mensaje,
    refId: row.ref_id,
    leida: row.leida,
    createdAt: row.created_at,
  }));
}

export async function markNotificacionesRead(userId: string): Promise<void> {
  const { error } = await getClient()
    .from("notificaciones")
    .update({ leida: true })
    .eq("user_id", userId)
    .eq("leida", false);
  if (error) postError("markNotificacionesRead", error);
}