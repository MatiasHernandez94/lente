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
import type { VisionInsightsState } from "@/lib/hooks/useVisionInsights";

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
  vision: VisionInsightsState;
}

/**
 * Panel presentacional de la IA de visión. La ejecución (auto-arranque, caché,
 * reintentos) vive en `useVisionInsights`, que se monta a nivel del visor para
 * que corra aunque esta pestaña esté cerrada.
 */
export function AIInsightsPanel({ videoId, playerCount, vision }: Props) {
  const { detection, improvements, detecting, improving, detectionError, runDetection, runImprovements } = vision;

  const [asignacion, setAsignacion] = useState<AsignacionData | null>(null);
  const [savingAsignacion, setSavingAsignacion] = useState(false);

  useEffect(() => {
    void fetch(`/api/videos/${videoId}/asignacion`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setAsignacion(d));
  }, [videoId]);

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

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
          <Brain size={15} /> IA de visión
        </h3>
        <p className="mt-0.5 text-xs text-muted">
          Detectamos lo que ocurre en el video con modelos de visión y lo cruzamos con tus métricas. {playerCount > 0 && `Sobre ${playerCount} personas detectadas.`}
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
            onClick={() => void runDetection()}
            disabled={detecting}
            className="inline-flex items-center gap-2 border border-ink/20 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            {detecting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {detecting ? "Detectando…" : detection ? "Volver a detectar" : "Detectar deporte"}
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

        {detectionError && (
          <div className="mt-3 border border-amber-200 bg-amber-50 p-3 text-amber-800">
            <p className="flex items-start gap-1.5 text-[12px] leading-4">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{detectionError.message}</span>
            </p>
          </div>
        )}

        {!detection && !detectionError && detecting && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
            <Loader2 size={11} className="animate-spin" /> Analizando el video automáticamente…
          </p>
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
            onClick={() => void runImprovements()}
            disabled={improving}
            className="inline-flex items-center gap-2 border border-ink/20 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            {improving ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
            {improving ? "Analizando…" : improvements?.improvements ? "Volver a analizar" : "Analizar y proponer mejoras"}
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

        {improving && !improvements?.improvements && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
            <Loader2 size={11} className="animate-spin" /> Generando recomendaciones…
          </p>
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
