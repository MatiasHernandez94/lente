import "server-only";
import { randomUUID } from "node:crypto";
import { getClient } from "@/lib/db";
import type { OKR } from "./types";

function postError(op: string, error: unknown): never {
  throw new Error(`${op}: ${error instanceof Error ? error.message : String(error)}`);
}

export async function createOKR(input: {
  videoId: string;
  userId: string;
  title: string;
  objective: string;
  keyResults: Array<{ label: string; target: string; unit?: string }>;
}): Promise<OKR> {
  const now = new Date().toISOString();
  const { data, error } = await getClient()
    .from("exercise_okrs")
    .insert({
      id: randomUUID(),
      video_id: input.videoId,
      user_id: input.userId,
      title: input.title,
      objective: input.objective,
      key_results: JSON.stringify(input.keyResults),
      status: "active",
      created_at: now,
      updated_at: now,
    })
    .select("id, video_id, user_id, title, objective, key_results, status, created_at, updated_at")
    .single();
  if (error) postError("createOKR", error);
  return {
    id: data.id,
    videoId: data.video_id,
    userId: data.user_id,
    title: data.title,
    objective: data.objective,
    keyResults: JSON.parse(data.key_results),
    status: data.status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function listOKRsForVideo(videoId: string): Promise<OKR[]> {
  const { data, error } = await getClient()
    .from("exercise_okrs")
    .select("id, video_id, user_id, title, objective, key_results, status, created_at, updated_at")
    .eq("video_id", videoId)
    .order("created_at", { ascending: false });
  if (error) postError("listOKRsForVideo", error);
  return (data as Array<{
    id: string; video_id: string; user_id: string; title: string;
    objective: string; key_results: string; status: string;
    created_at: string; updated_at: string;
  }>).map((row) => ({
    id: row.id,
    videoId: row.video_id,
    userId: row.user_id,
    title: row.title,
    objective: row.objective,
    keyResults: JSON.parse(row.key_results),
    status: row.status as OKR["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function updateOKRStatus(
  id: string,
  status: "active" | "completed" | "archived",
): Promise<void> {
  const { error } = await getClient()
    .from("exercise_okrs")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) postError("updateOKRStatus", error);
}

export async function deleteOKR(id: string): Promise<void> {
  const { error } = await getClient().from("exercise_okrs").delete().eq("id", id);
  if (error) postError("deleteOKR", error);
}
