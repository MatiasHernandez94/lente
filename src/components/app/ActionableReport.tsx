"use client";

import { AlertTriangle, Award, GraduationCap, Lightbulb, ListChecks, Play, Sparkles } from "lucide-react";
import type { ReportInsights, ActionItem } from "@/lib/analysis/insights";
import { useVideoSeek } from "@/components/sports/VideoSeekContext";

interface ReportPlayer {
  id: number;
  team: number;
  total_distance_m: number;
  max_speed_mps: number;
  avg_speed_mps: number;
}

interface ActionableReportProps {
  insights: ReportInsights | null;
  mode: string;
  sport: string;
  durationSeconds: number;
  eventSummary: Record<string, number>;
  players: ReportPlayer[];
  highSeverityRisks?: number;
  sportLabel: string;
  role?: string | null;
}

const PRIORITY_COLOR: Record<string, string> = {
  alta: "bg-red-100 text-red-700",
  media: "bg-amber-100 text-amber-700",
  baja: "bg-green-100 text-green-700",
};

// Consideramos "jugador en partido" al track con movimiento real (no público o
// banca estática, que producen pocos metros y velocidades de jitter de cámara).
const ACTIVE_MIN_DISTANCE_M = 10;
const ACTIVE_MIN_MAX_SPEED_MPS = 1.5;

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function TimeChip({ seconds }: { seconds: number }) {
  const { seekTo, seekable } = useVideoSeek();
  const disabled = !seekable || !Number.isFinite(seconds) || seconds < 0;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => seekTo(seconds)}
      title={disabled ? "Este video no admite salto por tiempo (embeds de YouTube)." : "Ir a este momento del video"}
      className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
        disabled
          ? "cursor-default bg-ink/5 text-muted"
          : "bg-ink/10 text-ink transition-colors hover:bg-ink/20"
      }`}
    >
      <Play size={8} />
      {formatTimestamp(seconds)}
    </button>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={`inline-flex rounded-sm px-1.5 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_COLOR[priority] ?? "bg-ink/5 text-ink"}`}
    >
      {priority}
    </span>
  );
}

/**
 * Informe accionable para jugador y entrenador: reordena la página para que lo
 * primero que se lea sea un resumen ejecutivo + "qué mejorar / qué hizo bien"
 * con marcas de tiempo que saltan al momento exacto, y un bloque para el
 * entrenador con los jugadores a observar.
 */
export function ActionableReport({
  insights,
  mode,
  sport,
  durationSeconds,
  eventSummary,
  players,
  highSeverityRisks = 0,
  sportLabel,
  role = "alumno",
}: ActionableReportProps) {
  const report = insights?.coach_report;
  const improvementsAI = insights?.improvements?.improvements ?? [];
  const reportImprovements = report?.improvements ?? [];
  const endOfVideo = durationSeconds && durationSeconds > 0 ? durationSeconds : Infinity;
  const inRange = (time: number | null | undefined) => time == null || time < endOfVideo;

  const actions: ActionItem[] = [
    ...improvementsAI.map((item) => ({
      title: item.title,
      detail: item.detail,
      priority: item.priority,
      referenceToMetric: item.referenceToMetric,
    })),
    ...reportImprovements
      .map((item) => ({
        title: item.title,
        detail: item.detail,
        time_s: item.time_s,
      }))
      .filter((item) => inRange(item.time_s)),
  ];
  // Sin duplicados por título (la IA puede repetir ideas entre mejoras y report).
  const uniqueActions = actions.filter(
    (item, index) => actions.findIndex((other) => other.title === item.title) === index,
  );

  const positives = (report?.positives ?? [])
    .filter((item) => inRange(item.time_s))
    .filter((item, index, list) => list.findIndex((other) => other.title === item.title) === index);

  const plan = report?.plan ?? [];

  const executiveSummary =
    report?.summary ??
    insights?.improvements?.summary ??
    defaultSummary(mode, eventSummary);

  const ballSeen =
    eventSummary["ball_out_of_frame"] != null ||
    eventSummary["ball_stopped"] != null ||
    eventSummary["possession_change"] != null;

  const activePlayers = players.filter(
    (player) =>
      player.total_distance_m >= ACTIVE_MIN_DISTANCE_M &&
      player.max_speed_mps >= ACTIVE_MIN_MAX_SPEED_MPS,
  );
  const noiseTrackCount = players.length - activePlayers.length;
  const partialAnalysis = mode !== "solo" && noiseTrackCount > 0;

  const topPlayers = [...activePlayers]
    .sort((a, b) => b.total_distance_m - a.total_distance_m)
    .slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Encabezado del informe */}
      <div className="border border-hairline bg-surface p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 text-base font-medium text-ink">
            <Sparkles size={16} /> Informe{mode === "solo" ? " de actividad" : " del partido"}
          </h2>
          {sport && sport !== "general" && (
            <span className="inline-flex items-center rounded-sm bg-ink/5 px-2 py-0.5 text-[10px] font-medium text-ink">
              {sportLabel}
            </span>
          )}
          {mode === "solo" ? (
            <span className="inline-flex items-center rounded-sm bg-ink/5 px-2 py-0.5 text-[10px] font-medium text-ink">
              Individual
            </span>
          ) : (
            <span className="inline-flex items-center rounded-sm bg-ink/5 px-2 py-0.5 text-[10px] font-medium text-ink">
              Equipo
            </span>
          )}
          {partialAnalysis && (
            <span
              title="El detector también ve público/banca (trazas casi estáticas). Los rankings y eventos usan solo las trazas con movimiento real."
              className="inline-flex items-center rounded-sm bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800"
            >
              Análisis parcial · {noiseTrackCount} trazas sin movimiento
            </span>
          )}
        </div>
        <p className="text-[13px] leading-5 text-ink">{executiveSummary}</p>
        {mode !== "solo" && !ballSeen && (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-muted">
            <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-500" />
            No se detectó el balón en el video (lejano o con mucho movimiento de cámara): las métricas
            tácticas se basan solo en el movimiento de jugadores.
          </p>
        )}
      </div>

      {/* Qué mejorar */}
      {uniqueActions.length > 0 && (
        <div className="border border-hairline bg-surface p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
            <Lightbulb size={14} className="text-amber-500" /> Qué mejorar
          </h3>
          <ul className="space-y-3">
            {uniqueActions.slice(0, 6).map((item, index) => (
              <li key={`${item.title}-${index}`} className="border-b border-hairline pb-3 last:border-b-0 last:pb-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{item.title}</span>
                  {item.priority && <PriorityBadge priority={item.priority} />}
                  {item.time_s != null && <TimeChip seconds={item.time_s} />}
                </div>
                <p className="text-[12px] leading-4 text-muted">{item.detail}</p>
                {item.referenceToMetric && (
                  <p className="mt-1 text-[10px] text-muted">Referencia: {item.referenceToMetric}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Plan de corrección */}
      {plan.length > 0 && (
        <div className="border border-hairline bg-surface p-4">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-medium text-ink">
            <ListChecks size={14} className="text-blue-500" /> Plan de corrección
          </h3>
          <p className="mb-3 text-[11px] leading-4 text-muted">
            Ejercicios y consignas para trabajar lo anterior en el próximo entrenamiento.
          </p>
          <ol className="space-y-2">
            {plan.slice(0, 3).map((drill, index) => (
              <li key={`${drill.title}-${index}`} className="flex gap-2">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-ink/10 text-[9px] font-semibold text-ink">
                  {index + 1}
                </span>
                <div>
                  <p className="text-[12px] font-medium text-ink">{drill.title}</p>
                  <p className="text-[12px] leading-4 text-muted">{drill.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Lo que hizo bien */}
      {positives.length > 0 && (
        <div className="border border-hairline bg-surface p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
            <Award size={14} className="text-green-500" /> Lo que hizo bien
          </h3>
          <ul className="space-y-3">
            {positives.slice(0, 5).map((item, index) => (
              <li key={`${item.title}-${index}`} className="border-b border-hairline pb-3 last:border-b-0 last:pb-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{item.title}</span>
                  {item.time_s != null && <TimeChip seconds={item.time_s} />}
                </div>
                <p className="text-[12px] leading-4 text-muted">{item.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Para el entrenador */}
      {role === "profesor" && topPlayers.length > 0 && (
        <div className="border border-hairline bg-surface p-4">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-medium text-ink">
            <GraduationCap size={14} /> Para el entrenador
          </h3>
          <p className="mb-3 text-[11px] leading-4 text-muted">
            Jugadores con más metros recorridos durante el tiempo en cámara (solo trazas con movimiento
            real). La identificación por dorsal se puede afinar más adelante.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {topPlayers.map((player) => (
              <div key={player.id} className="border border-hairline bg-surface p-3">
                <p className="text-[11px] font-semibold text-ink">Jugador #{player.id + 1}</p>
                <p className="mt-0.5 text-[10px] text-muted">
                  Equipo {player.team + 1} · {player.total_distance_m.toFixed(0)} m
                </p>
                <p className="text-[10px] text-muted">Vmax {player.max_speed_mps.toFixed(1)} m/s</p>
              </div>
            ))}
          </div>
          {highSeverityRisks > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-amber-800">
              <AlertTriangle size={12} /> {highSeverityRisks} riesgo(s) de lesión de severidad alta
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function defaultSummary(mode: string, eventSummary: Record<string, number>): string {
  if (mode === "solo") return "Actividad individual detectada. Ejecutá el informe de IA para recomendaciones específicas.";
  const parts: string[] = [];
  const total = Object.values(eventSummary).reduce((sum, count) => sum + count, 0);
  if (total > 0) parts.push(`${total} eventos clave`);
  return parts.length > 0
    ? `Análisis de equipo con ${parts.join(" y ")}. Generá el informe de IA para recomendaciones específicas.`
    : "Análisis de equipo completado. Generá el informe de IA para recomendaciones específicas.";
}

export { formatTimestamp };