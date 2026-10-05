/**
 * Progreso de un job de análisis deportivo.
 *
 * El script Python (`scripts/sports/analyze_full.py`) escribe un archivo
 * `.progress` junto a la salida; el proceso Node que lo lanza lo lee y lo
 * publica en el payload del job para que la UI pueda mostrar una barra de
 * progreso en vez de un spinner indefinido (un video de 50 min tardaba 42 min).
 *
 * Módulo puro (sin dependencias) para poder testearlo con `node --test`.
 */

export interface JobProgress {
  /** 0-100. `null` si aún no se conoce el total. */
  pct: number | null;
  stage: string;
  framesDone: number | null;
  framesTotal: number | null;
  updatedAt: string;
}

export const PROGRESS_SUFFIX = ".progress";

/** Ruta del archivo de progreso para una salida de análisis. */
export function progressPathFor(outputPath: string): string {
  return `${outputPath}${PROGRESS_SUFFIX}`;
}

/**
 * Normaliza el contenido del archivo de progreso. Tolera campos faltantes o
 * tipos inesperados porque lo escribe un proceso externo.
 */
export function parseProgress(raw: string, now = new Date()): JobProgress | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;

  const obj = data as Record<string, unknown>;
  const num = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const framesDone = num(obj.frames_done ?? obj.framesDone);
  const framesTotal = num(obj.frames_total ?? obj.framesTotal);
  const stage = typeof obj.stage === "string" && obj.stage.trim() ? obj.stage.trim() : "Procesando con YOLOv8";

  let pct = num(obj.pct);
  if (pct == null && framesDone != null && framesTotal != null && framesTotal > 0) {
    pct = Math.min(100, Math.round((framesDone / framesTotal) * 100));
  }
  if (pct != null) pct = Math.min(100, Math.max(0, Math.round(pct)));

  const updatedAtRaw = obj.updated_at ?? obj.updatedAt;
  const updatedAt = typeof updatedAtRaw === "string" && !Number.isNaN(Date.parse(updatedAtRaw))
    ? updatedAtRaw
    : now.toISOString();

  if (pct == null && framesDone == null && framesTotal == null && !("stage" in obj)) return null;

  return { pct, stage, framesDone, framesTotal, updatedAt };
}

/**
 * Un progreso más viejo que `maxAgeMs` se considera obsoleto (el worker murió
 * sin limpiarlo) y no se muestra, para no prometer avance que no existe.
 */
export function isProgressFresh(progress: JobProgress, now = new Date(), maxAgeMs = 10 * 60 * 1000): boolean {
  const at = Date.parse(progress.updatedAt);
  if (Number.isNaN(at)) return false;
  return now.getTime() - at <= maxAgeMs;
}

/** Tiempo restante estimado a partir del porcentaje ya avanzado. */
export function estimateRemainingSeconds(elapsedSec: number, pct: number | null): number | null {
  if (pct == null || pct <= 0 || elapsedSec <= 0) return null;
  const total = (elapsedSec / pct) * 100;
  return Math.max(0, Math.round(total - elapsedSec));
}