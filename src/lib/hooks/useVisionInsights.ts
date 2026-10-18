"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface VisionDetection {
  ok?: boolean;
  sport?: string;
  confidence?: number;
  reason?: string;
  provider?: string;
  cached?: boolean;
  status?: string;
  error?: string;
  kind?: string;
  detail?: string | null;
}

export interface VisionImprovement {
  title: string;
  detail: string;
  priority: "alta" | "media" | "baja";
  referenceToMetric?: string;
}

export interface VisionImprovements {
  summary?: string;
  improvements?: VisionImprovement[];
  playerCount?: number;
  provider?: string;
  cached?: boolean;
  status?: string;
  error?: string;
  kind?: string;
  detail?: string | null;
}

interface Pollable {
  status?: string;
  ok?: boolean;
  error?: string;
  kind?: string;
  detail?: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollUntilDone<T extends Pollable>(
  request: () => Promise<T>,
  isDone: (data: T) => boolean,
  apply: (data: T) => void,
  timeoutMs: number,
  intervalMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    try {
      const data = await request();
      if (isDone(data)) {
        apply(data);
        return;
      }
    } catch {
      // reintentar
    }
  }
  apply({ status: "none", error: "Tiempo de espera agotado mientras se procesaba.", kind: "timeout" } as T);
}

export interface VisionInsightsState {
  detection: VisionDetection | null;
  improvements: VisionImprovements | null;
  detecting: boolean;
  improving: boolean;
  detectionError: { kind: string; message: string } | null;
  detectionAttempted: boolean;
  improvementsAttempted: boolean;
  runDetection: () => Promise<void>;
  runImprovements: () => Promise<void>;
}

const ERROR_KINDS = new Set([
  "no_keys",
  "quota",
  "video_unavailable",
  "frames_unavailable",
  "network",
  "queued",
  "timeout",
]);

/**
 * Corre la IA de visión (detección de deporte + agente de mejoras) sola, una
 * sola vez por video, sin que el usuario tenga que apretar un botón.
 *
 * Estrategia "auto una vez, con caché": primero consulta si ya hay resultado
 * guardado (GET devuelve `cached: true`); si existe, lo muestra y NO vuelve a
 * llamar al modelo. Solo dispara la generación cuando no hay nada, para no
 * gastar tokens cada vez que se abre el video.
 *
 * `enabled` permite montarlo en el árbol desde el arranque pero activarlo recién
 * cuando el análisis deportivo está listo (la visión necesita el video).
 */
export function useVisionInsights(videoId: string, enabled: boolean): VisionInsightsState {
  const [detection, setDetection] = useState<VisionDetection | null>(null);
  const [improvements, setImprovements] = useState<VisionImprovements | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [improving, setImproving] = useState(false);
  const [detectionAttempted, setDetectionAttempted] = useState(false);
  const [improvementsAttempted, setImprovementsAttempted] = useState(false);

  // Arranca una sola vez por video. Un ref evita el doble disparo de StrictMode,
  // que duplicaría las llamadas (y el gasto) al modelo.
  const startedFor = useRef<string | null>(null);

  const runDetection = useCallback(async () => {
    setDetecting(true);
    setDetection(null);
    setDetectionAttempted(true);
    try {
      const res = await fetch(`/api/videos/${videoId}/detectar-deporte`, { method: "POST" });
      const data = (await res.json()) as VisionDetection & { status?: string };
      if (data?.status === "queued") {
        setDetection({ error: "La detección está en cola de procesamiento. Esperando resultado…", kind: "queued" });
        await pollUntilDone(
          () => fetch(`/api/videos/${videoId}/detectar-deporte`).then((r) => r.json() as Promise<VisionDetection>),
          (d) => d?.ok === true || d?.status === "none" || d?.status === "error",
          (d) => setDetection(d?.ok ? d : { error: d?.error ?? "La detección del deporte falló.", kind: d?.kind ?? "error", detail: d?.detail ?? null }),
          180_000,
        );
        return;
      }
      setDetection(data);
    } catch {
      setDetection({ error: "Error de red al intentar la detección.", kind: "network" });
    } finally {
      setDetecting(false);
    }
  }, [videoId]);

  const runImprovements = useCallback(async () => {
    setImproving(true);
    setImprovements(null);
    setImprovementsAttempted(true);
    try {
      const res = await fetch(`/api/videos/${videoId}/mejoras`, { method: "POST" });
      const data = (await res.json()) as VisionImprovements & { status?: string };
      if (data?.status === "queued") {
        setImprovements({ error: "El análisis está en cola de procesamiento. Esperando resultado…", kind: "queued", summary: "" });
        await pollUntilDone(
          () => fetch(`/api/videos/${videoId}/mejoras`).then((r) => r.json() as Promise<VisionImprovements>),
          (d) => d?.improvements != null || d?.error != null || d?.status === "none" || d?.status === "error",
          (d) => setImprovements(d?.improvements != null ? d : { error: d?.error ?? "La generación de mejoras falló.", kind: d?.kind ?? "error", detail: d?.detail ?? null, summary: "" }),
          180_000,
        );
        return;
      }
      setImprovements(data);
    } catch {
      setImprovements({ error: "Error de red al generar mejoras.", kind: "network", summary: "" });
    } finally {
      setImproving(false);
    }
  }, [videoId]);

  /**
   * Auto-arranque: lee caché y solo genera lo que falte.
   */
  useEffect(() => {
    if (!enabled) return;
    if (startedFor.current === videoId) return;
    startedFor.current = videoId;

    let cancelled = false;

    const ensureDetected = async () => {
      try {
        const data = (await fetch(`/api/videos/${videoId}/detectar-deporte`).then((r) => r.json())) as VisionDetection & { status?: string };
        if (cancelled) return;
        if (data?.ok) {
          setDetection(data);
          setDetectionAttempted(true);
          return;
        }
        if (data?.status === "queued") {
          setDetection({ error: "La detección está en cola de procesamiento. Esperando resultado…", kind: "queued" });
          setDetectionAttempted(true);
          await pollUntilDone(
            () => fetch(`/api/videos/${videoId}/detectar-deporte`).then((r) => r.json() as Promise<VisionDetection>),
            (d) => d?.ok === true || d?.status === "none" || d?.status === "error",
            (d) => !cancelled && setDetection(d?.ok ? d : { error: d?.error ?? "La detección del deporte falló.", kind: d?.kind ?? "error", detail: d?.detail ?? null }),
            180_000,
          );
          return;
        }
      } catch {
        // Si el GET falla, igual intentamos generar.
      }
      if (!cancelled) await runDetection();
    };

    const ensureImproved = async () => {
      try {
        const data = (await fetch(`/api/videos/${videoId}/mejoras`).then((r) => r.json())) as VisionImprovements & { status?: string };
        if (cancelled) return;
        if (data?.improvements != null) {
          setImprovements(data);
          setImprovementsAttempted(true);
          return;
        }
      } catch {
        // Si el GET falla, igual intentamos generar.
      }
      if (!cancelled) await runImprovements();
    };

    void ensureDetected();
    void ensureImproved();

    return () => {
      cancelled = true;
    };
  }, [enabled, videoId, runDetection, runImprovements]);

  const detectionError =
    detection?.error && ERROR_KINDS.has(detection.kind ?? "")
      ? { kind: detection.kind ?? "error", message: detection.error }
      : null;

  return {
    detection,
    improvements,
    detecting,
    improving,
    detectionError,
    detectionAttempted,
    improvementsAttempted,
    runDetection,
    runImprovements,
  };
}
