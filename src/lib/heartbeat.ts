import "server-only";
import { hostname } from "node:os";
import { getClient } from "./db";

/**
 * Heartbeat de una sola fila para el worker externo.
 *
 * El worker lo refresca mientras corre; el cron diario y el scheduler externo
 * lo leen para detectar procesos caídos.
 */

const HEARTBEAT_COLUMNS = "worker_id, pid, version, jobs_claimed, last_seen, updated_at";

export interface WorkerHeartbeat {
  workerId: string;
  pid: number | null;
  version: string | null;
  jobsClaimed: number;
  lastSeen: string;
  updatedAt: string;
}

export function currentWorkerId(): string {
  return `${hostname()}:${process.pid}`;
}

function parse(data: Record<string, unknown> | null): WorkerHeartbeat | null {
  if (!data) return null;
  return {
    workerId: String(data.worker_id ?? ""),
    pid: data.pid == null ? null : Number(data.pid),
    version: data.version == null ? null : String(data.version),
    jobsClaimed: Number(data.jobs_claimed ?? 0),
    lastSeen: String(data.last_seen),
    updatedAt: String(data.updated_at),
  };
}

/**
 * Refresca la fila de heartbeat.
 *
 * El worker mantiene el contador de jobs en memoria y manda el valor absoluto:
 * hay una sola fila y un solo writer, así que no hace falta un `update ... set
 * jobs_claimed = jobs_claimed + 1` ni una función RPC.
 *
 * Best effort: si falla, el worker sigue procesando.
 */
export async function writeWorkerHeartbeat(input: {
  workerId: string;
  pid?: number;
  version?: string | null;
  jobsClaimed?: number;
}): Promise<void> {
  try {
    const now = new Date().toISOString();
    const { error } = await getClient()
      .from("worker_heartbeat")
      .upsert(
        {
          id: 1,
          worker_id: input.workerId,
          pid: input.pid ?? null,
          version: input.version ?? null,
          jobs_claimed: input.jobsClaimed ?? 0,
          last_seen: now,
          updated_at: now,
        },
        { onConflict: "id" },
      );
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("[heartbeat] No se pudo actualizar el heartbeat:", error);
  }
}

export async function readWorkerHeartbeat(): Promise<WorkerHeartbeat | null> {
  const { data, error } = await getClient()
    .from("worker_heartbeat")
    .select(HEARTBEAT_COLUMNS)
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(`readWorkerHeartbeat: ${error.message}`);
  return parse(data);
}
