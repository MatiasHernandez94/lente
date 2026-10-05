/** Intentos máximos (incluye el primero) antes de marcar un job como error final. */
export const MAX_JOB_ATTEMPTS = 3;

/** Tipos de error que no tienen sentido reintentar (fallos permanentes). */
const NON_RETRYABLE_ERROR_KINDS = new Set([
  "video_unavailable",
  "unknown_job_kind",
  "no_sport_detected",
]);

/** Backoff exponencial en ms según intentos ya realizados (1er reintento ≈ 30s). */
export function retryDelayMs(attempts: number): number {
  return 30_000 * 2 ** Math.max(0, attempts - 1);
}

/** ¿El fallo es transitorio y conviene reintentar? */
export function isRetryableError(kind: string | null | undefined): boolean {
  if (!kind) return true;
  return !NON_RETRYABLE_ERROR_KINDS.has(kind);
}
/**
 * Normaliza cualquier excepción al payload de error que se guarda en la columna
 * `error` de un job. Comparte la forma que usa `isRetryableError`.
 */
export function errorPayload(error: unknown): Record<string, unknown> {
  const message = error instanceof Error ? error.message : String(error);
  const customKind =
    error instanceof Error ? (error as Error & { kind?: string }).kind : undefined;
  return { message, kind: customKind ?? "internal", detail: null };
}
