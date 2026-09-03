"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Activity, Play, RefreshCw } from "lucide-react";
import type { VideoRow } from "@/lib/schema";
import type {
  BodyKeypoint,
  BodyPose,
  ExecutionResult,
  ExecutionSnapshot,
  JointMetric,
  Rep,
} from "@/lib/execution/types";
import { EXERCISES, EXERCISE_BY_ID } from "@/lib/execution/exercises";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { youtubeEmbedUrl } from "@/components/analysis/VideoFrame";

interface ExecutionViewerProps {
  video: VideoRow;
  initial: ExecutionSnapshot;
}

const POLL_MS = 2500;
const BONES: [BodyKeypoint, BodyKeypoint][] = [
  ["nose", "left_eye"],
  ["nose", "right_eye"],
  ["left_eye", "left_ear"],
  ["right_eye", "right_ear"],
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"],
  ["right_shoulder", "right_elbow"],
  ["left_elbow", "left_wrist"],
  ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"],
  ["right_hip", "right_knee"],
  ["left_knee", "left_ankle"],
  ["right_knee", "right_ankle"],
];

interface FetchError extends Error {
  status: number;
}

async function executionFetch(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const error = new Error((body.error as string) ?? "Solicitud inválida.") as FetchError;
    error.status = res.status;
    throw error;
  }
  return body;
}

function poseAtTime(result: ExecutionResult, t: number): BodyPose {
  const frames = result.frames;
  if (frames.length === 0) return {};
  let best = frames[0];
  for (const frame of frames) {
    if (Math.abs(frame.t - t) < Math.abs(best.t - t)) best = frame;
  }
  return best.pose;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function verdictColor(overall: number): string {
  if (overall >= 80) return "bg-green-600";
  if (overall >= 60) return "bg-amber-500";
  return "bg-red-600";
}

function JointRow({ metric }: { metric: JointMetric }) {
  const label = `${metric.label}${metric.side === "left" ? " (izq.)" : metric.side === "right" ? " (der.)" : ""}`;
  return (
    <div className="border border-hairline p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className="label text-muted">Rango {Math.round(metric.range)}°</span>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="label text-muted">Min</dt>
          <dd className="mt-0.5 font-semibold text-ink">{Math.round(metric.min)}°</dd>
        </div>
        <div>
          <dt className="label text-muted">Max</dt>
          <dd className="mt-0.5 font-semibold text-ink">{Math.round(metric.max)}°</dd>
        </div>
        <div>
          <dt className="label text-muted">Media</dt>
          <dd className="mt-0.5 font-semibold text-ink">{Math.round(metric.mean)}°</dd>
        </div>
        <div>
          <dt className="label text-muted">Control</dt>
          <dd className="mt-0.5 font-semibold text-ink">{metric.control}/100</dd>
        </div>
      </dl>
    </div>
  );
}

function RepList({ reps }: { reps: Rep[] }) {
  if (reps.length === 0) {
    return <p className="text-sm leading-6 text-muted">No se detectaron repeticiones completas.</p>;
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {reps.map((rep) => (
        <div key={rep.index} className="border border-hairline p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium text-ink">Repetición {rep.index + 1}</span>
            <span className="label text-muted">{rep.depthPct.toFixed(0)}% de rango</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Profundidad {formatTime(rep.peakT)} · ritmo {rep.tempoSeconds.toFixed(1)}s · control {rep.control}
          </p>
        </div>
      ))}
    </div>
  );
}

export function ExecutionViewer({ video, initial }: ExecutionViewerProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const statusRef = useRef(initial.status);

  const [status, setStatus] = useState<ExecutionSnapshot["status"]>(initial.status);
  const [data, setData] = useState<ExecutionResult | null>(initial.data);
  const [evaluation, setEvaluation] = useState(initial.evaluation);
  const [exerciseId, setExerciseId] = useState<string | null>(initial.exerciseId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const mediaUrl = `/api/media/${encodeURIComponent(video.sourceRef ?? "")}`;
  const isLocal = video.sourceType === "upload" || video.sourceType === "camera";
  const isDemoYoutube = video.sourceType === "youtube";
  const embedUrl = isDemoYoutube && video.sourceRef ? youtubeEmbedUrl(video.sourceRef) : null;
  const demoDuration = data?.video.durationSec ?? 60;
  const exercise = exerciseId ? EXERCISE_BY_ID[exerciseId] : null;

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const loadSnapshot = useCallback(async () => {
    const snapshot = (await executionFetch(`/api/videos/${video.id}/execution`)) as unknown as ExecutionSnapshot;
    setStatus(snapshot.status);
    setData(snapshot.data);
    setEvaluation(snapshot.evaluation);
    setExerciseId(snapshot.exerciseId);
  }, [video.id]);

  useEffect(() => {
    if (status !== "running") return;
    const timer = setInterval(() => {
      loadSnapshot()
        .then(() => {
          if (statusRef.current !== "running") clearInterval(timer);
        })
        .catch((err) => setError(err.message));
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [status, loadSnapshot]);

  const startAnalysis = async () => {
    if (!exerciseId) return;
    setBusy(true);
    setError(null);
    try {
      await executionFetch(`/api/videos/${video.id}/execution`, {
        method: "POST",
        body: JSON.stringify({ exerciseId }),
      });
      setStatus("running");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar el análisis.");
      setStatus("none");
    } finally {
      setBusy(false);
    }
  };

  const changeExercise = async () => {
    if (!exerciseId) return;
    setBusy(true);
    setError(null);
    try {
      await executionFetch(`/api/videos/${video.id}/execution`, {
        method: "PATCH",
        body: JSON.stringify({ exerciseId }),
      });
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el ejercicio.");
    } finally {
      setBusy(false);
    }
  };

  const pose = data ? poseAtTime(data, currentTime) : {};
  const primaryMetric = evaluation ? evaluation.joints.find((j) => j.side === "eje") ?? evaluation.joints[0] : null;

  if (status === "none") {
    return (
      <div className="border border-hairline bg-surface px-6 py-12 text-center">
        <Activity size={28} strokeWidth={1.5} className="mx-auto mb-4 text-soft" aria-hidden="true" />
        <p className="mx-auto max-w-md text-sm leading-6 text-muted">
          El análisis de ejecución mide la técnica de un ejercicio (movilidad o fuerza) a partir del video,
          estimando ángulos articulares en tiempo real. En computadora, puede ejecutarse con visión local.
        </p>
        <div className="mx-auto mt-6 flex max-w-sm flex-col gap-3">
          <Select
            value={exerciseId ?? EXERCISES[0].id}
            onChange={(event) => setExerciseId(event.target.value)}
            aria-label="Elegir ejercicio"
          >
            {EXERCISES.map((value) => (
              <option key={value.id} value={value.id}>
                {value.category === "movilidad" ? "Movilidad — " : "Fuerza — "}
                {value.name}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={startAnalysis} disabled={busy}>
            {busy ? <RefreshCw size={14} className="animate-spin" aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            {busy ? "Iniciando…" : "Analizar ejecución"}
          </Button>
        </div>
        {error ? <p className="mt-4 text-sm text-red-900">{error}</p> : null}
      </div>
    );
  }

  if (status === "running") {
    return (
      <div className="border border-hairline bg-surface px-6 py-12 text-center">
        <RefreshCw size={28} strokeWidth={1.5} className="mx-auto mb-4 animate-spin text-soft" aria-hidden="true" />
        <p className="text-sm font-medium text-ink">Analizando ejecución</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
          Estimando la pose en cada fotograma para calcular los ángulos articulares del ejercicio. Puede cerrar la
          página y consultar el progreso luego.
        </p>
        {error ? <p className="mt-4 text-sm text-red-900">{error}</p> : null}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="border border-hairline bg-surface px-6 py-12 text-center">
        <p className="text-sm font-medium text-ink">El análisis no pudo completarse</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{error ?? initial.errorMessage ?? "Error interno."}</p>
        <Button variant="outline" size="sm" className="mt-6" onClick={startAnalysis}>
          <RefreshCw size={14} aria-hidden="true" /> Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => router.push(`/app/videos/${video.id}`)}>
            <ArrowLeft size={14} aria-hidden="true" /> Análisis
          </Button>
          <span className="label text-muted">Ejecución de ejercicio</span>
          {exercise ? <span className="label">{exercise.name}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={exerciseId ?? EXERCISES[0].id}
            onChange={(event) => setExerciseId(event.target.value)}
            aria-label="Elegir ejercicio"
          >
            {EXERCISES.map((value) => (
              <option key={value.id} value={value.id}>
                {value.name}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="outline" onClick={changeExercise} disabled={busy}>
            Cambiar
          </Button>
        </div>
      </div>

      <div className="relative aspect-video w-full overflow-hidden bg-ink" role="group" aria-label="Ejecución con esqueleto">
        {isLocal ? (
          <video
            ref={videoRef}
            src={mediaUrl}
            controls
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full"
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          >
            <p className="p-4 text-sm text-white">Su navegador no puede reproducir este video.</p>
          </video>
        ) : embedUrl ? (
          <iframe
            src={embedUrl}
            title={`Video fuente: ${video.title}`}
            className="absolute inset-0 h-full w-full"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : null}
        {data ? (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
            <title>Esqueleto de la pose detectada</title>
            {Object.entries(pose).length === 0 ? null : (
              <>
                {BONES.map(([a, b]) =>
                  pose[a] && pose[b] ? (
                    <line
                      key={`${a}-${b}`}
                      x1={pose[a].x * 100}
                      y1={pose[a].y * 100}
                      x2={pose[b].x * 100}
                      y2={pose[b].y * 100}
                      stroke="#22d3ee"
                      strokeWidth={1.2}
                      strokeLinecap="round"
                    />
                  ) : null,
                )}
                {Object.entries(pose).map(([key, point]) => (
                  <circle key={key} cx={point.x * 100} cy={point.y * 100} r={1.6} fill="#ffffff" />
                ))}
              </>
            )}
          </svg>
        ) : null}
      </div>

      {isDemoYoutube && data ? (
        <div className="flex items-center gap-3">
          <span className="label shrink-0 text-muted">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={demoDuration}
            step={0.1}
            value={Math.min(currentTime, demoDuration)}
            onChange={(event) => setCurrentTime(Number(event.target.value))}
            className="w-full"
            aria-label="Línea de tiempo del análisis de ejemplo"
          />
          <span className="label shrink-0 text-muted">{formatTime(demoDuration)}</span>
        </div>
      ) : null}

      {evaluation ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="border border-hairline p-5 text-center">
              <p className="label text-muted">Puntuación</p>
              <p className="mt-1 text-4xl font-bold text-ink">{evaluation.score.overall}</p>
              <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${verdictColor(evaluation.score.overall)}`}>
                {evaluation.score.verdict}
              </span>
            </div>
            <Stat label="Rango" value={evaluation.score.range} />
            <Stat label="Control" value={evaluation.score.control} />
            <Stat label="Ritmo" value={evaluation.score.tempo} />
            <Stat label="Simetría" value={evaluation.score.symmetry} />
          </section>

          <section>
            <h2 className="mb-3 text-base font-medium text-ink">Ángulos articulares</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {evaluation.joints.map((joint) => (
                <JointRow key={joint.key + joint.side} metric={joint} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-base font-medium text-ink">Repeticiones detectadas</h2>
            <RepList reps={evaluation.reps} />
          </section>
        </>
      ) : (
        <div className="border border-hairline bg-surface px-6 py-10 text-center">
          <p className="text-sm leading-6 text-muted">El ejercicio aún no tiene resultados evaluados.</p>
        </div>
      )}

      {primaryMetric ? (
        <section className="border border-hairline bg-surface p-5">
          <h2 className="mb-2 flex items-center gap-2 text-base font-medium text-ink">
            <Activity size={17} strokeWidth={1.8} aria-hidden="true" /> Recomendación
          </h2>
          <p className="text-sm leading-6 text-muted">{exercise?.summary}</p>
          <p className="mt-3 text-sm text-muted">
            Ángulo primario: <span className="font-semibold text-ink">{primaryMetric.label}</span> con un control de{" "}
            <span className="font-semibold text-ink">{primaryMetric.control}/100</span>.
          </p>
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-900">{error}</p> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-hairline p-5 text-center">
      <p className="label text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold text-ink">{value}</p>
    </div>
  );
}
