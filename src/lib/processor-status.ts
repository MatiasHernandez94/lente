/**
 * Lógica pura de estados de `processing_jobs`, sin dependencias de base de
 * datos. Vive aparte de `processor.ts` para poder testearse con `node --test`
 * (ese módulo importa `server-only`).
 */

/** Minutos tras los cuales un job en `processing` se considera abandonado. */
export const STALE_MINUTES_BY_KIND: Record<string, number> = {
  // Un análisis deportivo sobre un video largo puede tardar más de 40 min
  // (YOLO a 5 fps sobre 50+ min de video). Con el umbral general de 30 min un
  // job sano se revivía mientras seguía corriendo y el worker lo reclamaba
  // otra vez, lanzando dos análisis en paralelo sobre el mismo video.
  sports: 240,
  "detect-sport": 120,
  improvements: 60,
  "coach-report": 60,
  default: 60,
};

/** Umbral de abandono (en minutos) para un tipo de job. */
export function staleMinutesForKind(kind: string): number {
  return STALE_MINUTES_BY_KIND[kind] ?? STALE_MINUTES_BY_KIND.default;
}

/** Estado que debe reportar la API para un video+tipo de job. */
export type JobViewStatus = "queued" | "error" | "none";

/**
 * Clasifica el estado visible de un job a partir del job activo y del último job.
 *
 * Clave: un job `pending` que conserva el error del intento fallido anterior
 * **sigue en cola** (se va a reintentar), no ha fallado. Solo se reporta `error`
 * cuando no hay job activo y el último terminó en error de forma terminal.
 */
export function resolveJobViewStatus(
  activeJob: unknown | null,
  latestJob: { status?: string; error?: unknown } | null,
): JobViewStatus {
  if (activeJob) return "queued";
  if (latestJob?.status === "error") return "error";
  return "none";
}

/** Mensaje de error legible a partir del payload de error de un job. */
export function jobErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (message) return String(message);
  }
  return fallback;
}