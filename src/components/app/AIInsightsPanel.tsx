"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Brain,
  Check,
  Loader2,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";

async function pollUntilDone<T extends { status?: string; ok?: boolean; error?: string; kind?: string; detail?: string | null }>(
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface DetectionResult {
  ok?: boolean;
  sport?: string;
  confidence?: number;
  reason?: string;
  provider?: string;
  error?: string;
  kind?: string;
  detail?: string | null;
}

interface Improvement {
  title: string;
  detail: string;
  priority: "alta" | "media" | "baja";
  referenceToMetric?: string;
}

interface ImprovementsResult {
  summary?: string;
  improvements?: Improvement[];
  playerCount?: number;
  provider?: string;
  cached?: boolean;
  error?: string;
  kind?: string;
  detail?: string | null;
}

interface AsignacionData {
  userId: string;
  userRol: string;
  assignedAlumnoId: string | null;
  alumnos: Array<{ id: string; name: string; email: string }>;
  assignedAlumnoName: string | null;
}

interface Props {
  videoId: string;
  playerCount: number;
}

export function AIInsightsPanel({ videoId, playerCount }: Props) {
  const [detecting, setDetecting] = useState(false);
  const [improving, setImproving] = useState(false);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [improvements, setImprovements] = useState<ImprovementsResult | null>(null);

  const [asignacion, setAsignacion] = useState<AsignacionData | null>(null);
  const [savingAsignacion, setSavingAsignacion] = useState(false);

  useEffect(() => {
    void fetch(`/api/videos/${videoId}/asignacion`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setAsignacion(d));

    void fetch(`/api/videos/${videoId}/mejoras`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (d && d.status !== "none") setImprovements(d);
      });
  }, [videoId]);

  const detectSport = async () => {
    setDetecting(true);
    setDetection(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/detectar-deporte`, { method: "POST" });
      const data = await res.json();
      if (data?.status === "queued") {
        setDetection({ error: "La detección está en cola de procesamiento. Esperando resultado…", kind: "queued" });
        await pollUntilDone(
          () => fetch(`/api/videos/${videoId}/detectar-deporte`).then((r) => r.json()),
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
  };

  const generateImprovements = async () => {
    setImproving(true);
    setImprovements(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/mejoras`, { method: "POST" });
      const data = await res.json();
      if (data?.status === "queued") {
        setImprovements({ error: "El análisis está en cola de procesamiento. Esperando resultado…", kind: "queued", summary: "" });
        await pollUntilDone(
          () => fetch(`/api/videos/${videoId}/mejoras`).then((r) => r.json()),
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
  };

  const assignTo = async (alumnoId: string | null) => {
    setSavingAsignacion(true);
    try {
      const res = await fetch(`/api/videos/${videoId}/asignacion`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alumnoId }),
      });
      if (res.ok) {
        setAsignacion((prev) =>
          prev
            ? {
                ...prev,
                assignedAlumnoId: alumnoId,
                assignedAlumnoName: alumnoId ? (prev.alumnos.find((a) => a.id === alumnoId)?.name ?? null) : null,
              }
            : prev,
        );
      }
    } finally {
      setSavingAsignacion(false);
    }
  };

  const error = detection?.kind === "no_keys" || detection?.kind === "quota" || detection?.kind === "video_unavailable" || detection?.kind === "frames_unavailable" || detection?.kind === "network" || detection?.kind === "queued" || detection?.kind === "timeout"
    ? { kind: detection.kind, message: detection.error ?? "" }
    : null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
          <Brain size={15} /> IA de visión
        </h3>
        <p className="mt-0.5 text-xs text-muted">
          Detectamos lo que ocurre en el video con modelos de visión y lo cruzamos con tus métricas. {playerCount > 0 && `Sobre ${playerCount} jugadores detectados.`}
        </p>
      </div>

      {/* Detección de deporte */}
      <div className="border border-hairline bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-ink">¿Qué deporte es?</p>
            <p className="mt-0.5 text-[12px] leading-4 text-muted">
              La IA analiza los fotogramas y responde deporte + confianza, o te explica por qué no pudo.
            </p>
          </div>
          <button
            onClick={detectSport}
            disabled={detecting}
            className="inline-flex items-center gap-2 border border-ink/20 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            {detecting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {detecting ? "Detectando…" : "Detectar deporte"}
          </button>
        </div>

        {detection?.ok && detection.sport && (
          <div className="mt-3 border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <p className="font-medium">
              Deporte detectado: <strong className="capitalize">{detection.sport}</strong>{" "}
              {detection.confidence !== undefined && `(${Math.round(detection.confidence * 100)}% confianza)`}
            </p>
            {detection.reason && <p className="mt-1 text-[12px] leading-4 text-green-700">{detection.reason}</p>}
          </div>
        )}

        {error && (
          <div className="mt-3 border border-amber-200 bg-amber-50 p-3 text-amber-800">
            <p className="flex items-start gap-1.5 text-[12px] leading-4">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{error.message}</span>
            </p>
          </div>
        )}

        {!detection && !error && (
          <p className="mt-2 text-[11px] text-muted">Requerirá una API key de Gemini configurada en el backend.</p>
        )}
      </div>

      {/* Agente de mejoras */}
      <div className="border border-hairline bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-ink">Agente de mejoras</p>
            <p className="mt-0.5 text-[12px] leading-4 text-muted">
              Un agente analiza tu video y tus métricas y propone recomendaciones concretas para mejorar.
            </p>
          </div>
          <button
            onClick={generateImprovements}
            disabled={improving}
            className="inline-flex items-center gap-2 border border-ink/20 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            {improving ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
            {improving ? "Analizando…" : improvements ? "Volver a analizar" : "Analizar y proponer mejoras"}
          </button>
        </div>

        {improvements?.error && (
          <div className="mt-3 border border-amber-200 bg-amber-50 p-3 text-amber-800">
            <p className="flex items-start gap-1.5 text-[12px] leading-4">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{improvements.error}</span>
            </p>
          </div>
        )}

        {improvements?.improvements && improvements.improvements.length > 0 && (
          <div className="mt-3 space-y-2">
            {improvements.summary && (
              <p className="text-[12px] leading-4 text-muted">{improvements.summary}</p>
            )}
            {improvements.improvements.map((item, i) => (
              <div key={i} className="border border-hairline bg-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-ink">{item.title}</p>
                  <span
                    className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${
                      item.priority === "alta"
                        ? "bg-red-100 text-red-700"
                        : item.priority === "media"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-green-100 text-green-700"
                    }`}
                  >
                    {item.priority}
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-4 text-muted">{item.detail}</p>
              </div>
            ))}
          </div>
        )}

        {!improvements && !improving && (
          <p className="mt-2 text-[11px] text-muted">Genera un informe con el agente para ver recomendaciones.</p>
        )}
      </div>

      {/* Asignación a un alumno */}
      {asignacion && asignacion.userRol === "profesor" && (
        <div className="border border-hairline bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-xs font-medium text-ink">
                <UserCheck size={13} /> Asignar análisis a un alumno vinculado
              </p>
              <p className="mt-0.5 text-[12px] leading-4 text-muted">
                {asignacion.alumnos.length === 0
                  ? "No tenés alumnos vinculados todavía."
                  : "Elegí a quién corresponde este análisis."}
              </p>
            </div>
            {asignacion.alumnos.length > 0 && (
              <select
                value={asignacion.assignedAlumnoId ?? ""}
                onChange={(e) => void assignTo(e.target.value === "" ? null : e.target.value)}
                disabled={savingAsignacion}
                className="border border-ink/20 bg-surface px-2 py-1.5 text-xs text-ink outline-none focus:border-ink disabled:opacity-50"
              >
                <option value="">Sin asignar</option>
                {asignacion.alumnos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {asignacion.assignedAlumnoName && (
            <p className="mt-2 flex items-center gap-1 text-[12px] text-muted">
              <Check size={12} className="text-green-600" /> Asignado a {asignacion.assignedAlumnoName}
            </p>
          )}
        </div>
      )}

      {/* Cuenta de personas */}
      {playerCount > 0 && (
        <div className="border border-hairline bg-surface p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-ink">
            <Users size={13} /> Personas detectadas en el video
          </p>
          <p className="mt-1 text-2xl font-semibold text-ink">{playerCount}</p>
          <p className="mt-0.5 text-[11px] text-muted">Conteo real de jugadores detectados por el análisis.</p>
        </div>
      )}
    </div>
  );
}