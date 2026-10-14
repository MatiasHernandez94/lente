"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { youtubeEmbedUrl } from "@/components/analysis/VideoFrame";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock,
  Flame,
  Footprints,
  Gauge,
  Info,
  MessageCircle,
  PauseCircle,
  Play,
  Radio,
  Repeat,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { CoachChat } from "@/components/coach/CoachChat";
import { OKRDashboard } from "@/components/okrs/OKRDashboard";
import { AIInsightsPanel } from "@/components/app/AIInsightsPanel";
import { ActionableReport } from "@/components/app/ActionableReport";
import { VideoSeekProvider, useVideoSeek } from "@/components/sports/VideoSeekContext";
import type { ReportInsights } from "@/lib/analysis/insights";
import type { UserRol } from "@/lib/schema";

interface SoloAnalysis {
  activity_detected: boolean;
  duration_s?: number;
  total_distance_m?: number;
  primary_person_id?: number;
  total_persons?: number;
  rhythm?: {
    rhythm_detected: boolean;
    frequency_hz?: number;
    frequency_rpm?: number;
    consistency?: number;
    oscillation_amplitude_px?: number;
    oscillation_amplitude_m?: number;
    oscillation_peaks?: number;
  };
  intensity?: {
    level: string;
    score: number;
    avg_speed_mps?: number;
    max_speed_mps?: number;
    active_time_ratio?: number;
    speed_zones?: Record<string, number>;
    speed_basis?: string;
  };
  movement?: { pattern: string };
  repetitions?: {
    repetitions_detected: boolean;
    count: number;
    avg_interval_s?: number;
    rhythm_consistency?: number;
    frequency_rpm?: number;
    source?: string;
  };
  detailed?: {
    intensity_trend?: string;
    intensity_change_pct?: number;
    rest_periods?: number;
    total_rest_s?: number;
    work_time_s?: number;
    work_rest_ratio?: number | null;
    avg_rest_s?: number;
  };
  summary?: string;
  narrative?: string;
}

interface TeamAnalysis {
  formations: Record<string, { formation: string }>;
  possession: Record<string, number>;
  pressing: Record<string, { intensity: string }>;
  transitions: { total: number };
}

interface FatigueSummary {
  fatigued_players: number;
  total_injury_risks: number;
  high_severity_risks: number;
}

interface SportSpecificMetric {
  metric: string;
  value: number | string | null;
  unit: string;
  confidence: number;
  computed: boolean;
}

interface SportSpecificAnalysis {
  sport: string;
  metrics: SportSpecificMetric[];
  limitations: string[];
}

interface SportsData {
  mode: "solo" | "team";
  sport: string;
  video: { width: number; height: number; fps: number; duration_s: number };
  tracking: {
    summary: {
      total_players_detected: number;
      raw_tracks_detected?: number;
      ghost_tracks_filtered?: number;
    };
    players: Array<{
      id: number;
      team: number;
      avg_speed_mps: number;
      max_speed_mps: number;
      total_distance_m: number;
    }>;
  };
  events: {
    total_events: number;
    event_summary: Record<string, number>;
  };
  solo?: SoloAnalysis;
  tactical?: TeamAnalysis;
  fatigue?: { summary: FatigueSummary };
  sport_specific?: SportSpecificAnalysis | null;
  scale?: {
    meters_per_pixel?: number;
    reference_bbox_height_px?: number;
    reference_person_m?: number;
    method?: string;
    confidence?: string;
    samples?: number;
  } | null;
  sport_metrics?: Record<string, unknown> | null;
  sport_narrative?: string;
  processing_time_s: number;
}

type AnalysisStatus = "loading" | "queued" | "none" | "ready" | "error";
type ToolTab = "none" | "coach" | "okrs" | "ai";

const POLL_MS = 3000;

/** Progreso que publica el worker mientras analiza (ver src/lib/job-progress.ts). */
interface JobProgress {
  pct?: number | null;
  stage?: string | null;
  framesDone?: number | null;
  framesTotal?: number | null;
}

/**
 * Segundos transcurridos desde `startedAt`. El estado solo se actualiza desde
 * callbacks del temporizador (nunca de forma sincrónica en el efecto) porque el
 * reloj se lee en un callback, no durante el render.
 */
function useElapsed(startedAt: number | null): number | null {
  const [elapsed, setElapsed] = useState<number | null>(null);
  useEffect(() => {
    if (startedAt == null) return;
    const compute = () =>
      setElapsed(Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
    const first = setTimeout(compute, 0);
    const id = setInterval(compute, 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [startedAt]);
  return startedAt == null ? null : elapsed;
}

/** Estima el tiempo restante a partir del porcentaje ya avanzado. */
function estimateRemaining(elapsedSec: number, pct: number): string {
  if (pct <= 0) return "…";
  const total = (elapsedSec / pct) * 100;
  const rest = Math.max(0, Math.round(total - elapsedSec));
  if (rest < 60) return `${rest} s`;
  return `${Math.ceil(rest / 60)} min`;
}

interface Props {
  videoId: string;
  videoTitle: string;
  videoUrl: string;
  sourceType?: string;
  sourceRef?: string | null;
  sport: string;
  initialSeconds?: number;
}

export function VideoInsights({ videoId, videoTitle, videoUrl, sourceType, sourceRef, sport, initialSeconds }: Props) {
  const [status, setStatus] = useState<AnalysisStatus>("loading");
  const [data, setData] = useState<SportsData | null>(null);
  const [insights, setInsights] = useState<ReportInsights | null>(null);
  const [role, setRole] = useState<UserRol | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toolTab, setToolTab] = useState<ToolTab>("none");
  const [polling, setPolling] = useState(true);
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  // Ref (no estado) para bloquear el doble envío: setState es asíncrono y dos
  // clics rápidos disparaban dos POST antes del re-render.
  const submitting = useRef(false);
  // Incrementar reinicia el efecto de polling (p. ej. tras encolar un análisis).
  const [pollNonce, setPollNonce] = useState(0);
  const elapsed = useElapsed(startedAt);

  const fetchAnalysis = useCallback(async () => {
    try {
      const res = await fetch(`/api/videos/${videoId}/sports`);
      if (!res.ok) throw new Error("Error");
      const json = await res.json();
      setStatus(json.status);
      if (json.analysis) setData(json.analysis);
      if (json.insights) setInsights(json.insights);
      if (json.role) setRole(json.role);
      if (json.progress) setProgress(json.progress);
      if (json.queuedAt) setStartedAt(Date.parse(json.queuedAt));
      return json.status as AnalysisStatus;
    } catch {
      setError("Error al cargar el análisis");
      setStatus("error");
      return "error" as AnalysisStatus;
    }
  }, [videoId]);

  /**
   * Consulta el estado del análisis y sigue polling mientras esté en cola o en
   * curso. Al montar se usa para detectar un trabajo ya encolado (p. ej. tras
   * recargar la página); al pulsar "Iniciar" se reinicia con `pollNonce`.
   */
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let noneSeen = 0;

    const tick = async () => {
      const result = await fetchAnalysis();
      if (cancelled) return;
      if (result === "queued" || result === "loading") {
        timer = setTimeout(tick, POLL_MS);
        return;
      }
      if (result === "none") {
        noneSeen += 1;
        if (noneSeen < 6) {
          timer = setTimeout(tick, POLL_MS);
          return;
        }
      }
      setPolling(false);
    };

    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchAnalysis, pollNonce]);

  const startAnalysis = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setStatus("loading");
    setError(null);
    setProgress(null);
    setStartedAt(Date.now());
    try {
      const res = await fetch(`/api/videos/${videoId}/sports`, { method: "POST" });
      if (!res.ok) throw new Error("Error");
      const json = await res.json();
      setStatus(json.status);
      if (json.analysis) setData(json.analysis);
      if (json.insights) setInsights(json.insights);
      if (json.role) setRole(json.role);
      if (json.progress) setProgress(json.progress);
      if (json.queuedAt) setStartedAt(Date.parse(json.queuedAt));
      // La cola puede tardar: reiniciamos el polling hasta que termine.
      if (json.status === "queued" || json.status === "loading") {
        setPolling(true);
        setPollNonce((n) => n + 1);
      } else {
        setPolling(false);
      }
    } catch {
      setError("Error al iniciar el análisis");
      setStatus("error");
    } finally {
      submitting.current = false;
    }
  };

  // ── En cola / en curso ──
  if (status === "queued") {
    return (
      <div className="space-y-6">
        <VideoHero videoUrl={videoUrl} sourceType={sourceType} sourceRef={sourceRef} title={videoTitle} initialSeconds={initialSeconds} />
        <div className="border border-hairline bg-surface p-12 text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
          <p className="text-sm font-medium text-ink">
            {progress?.stage ? progress.stage : "Análisis deportivo en cola"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {progress?.pct != null
              ? `${progress.pct}% · ${progress.framesDone ?? 0}/${progress.framesTotal ?? 0} fotogramas`
              : "YOLOv8 detectando personas y analizando movimiento…"}
          </p>
          {elapsed != null && (
            <p className="mt-3 text-xs tabular-nums text-muted">
              {elapsed < 60 ? `Hace ${elapsed} s` : `Hace ${Math.floor(elapsed / 60)} min`}
              {progress?.pct != null ? ` · queda ~${estimateRemaining(elapsed, progress.pct)}` : ""}
            </p>
          )}
          <p className="mt-4 text-xs text-muted">
            Podés cerrar esta página: el análisis sigue en el servidor.
          </p>
        </div>
      </div>
    );
  }

  // ── Loading ──
  if (status === "loading") {
    return (
      <div className="space-y-6">
        <VideoHero videoUrl={videoUrl} sourceType={sourceType} sourceRef={sourceRef} title={videoTitle} initialSeconds={initialSeconds} />
        <div className="border border-hairline bg-surface p-12 text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
          <p className="text-sm font-medium text-ink">Procesando con YOLOv8</p>
          <p className="mt-1 text-xs text-muted">Detección de personas, análisis de movimiento…</p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (status === "error") {
    return (
      <div className="space-y-6">
        <VideoHero videoUrl={videoUrl} sourceType={sourceType} sourceRef={sourceRef} title={videoTitle} initialSeconds={initialSeconds} />
        <div className="border border-red-200 bg-red-50 p-8 text-center">
          <AlertTriangle className="mx-auto mb-2 text-red-500" size={24} />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={startAnalysis} className="mt-3 border border-ink/20 px-4 py-1.5 text-xs text-ink hover:bg-surface">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // ── No analysis ──
  if (status === "none" || !data) {
    return (
      <div className="space-y-6">
        <VideoHero videoUrl={videoUrl} sourceType={sourceType} sourceRef={sourceRef} title={videoTitle} initialSeconds={initialSeconds} />
        <div className="border border-hairline bg-surface p-10 text-center">
          {polling ? (
            <>
              <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
              <p className="mb-1 text-sm font-medium text-ink">Procesando análisis deportivo</p>
              <p className="text-xs text-muted">YOLOv8 detectando personas y analizando movimiento…</p>
            </>
          ) : (
            <>
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-ink/5">
                <BarChart3 className="text-ink" size={24} />
              </div>
              <p className="mb-1 text-sm font-medium text-ink">Sin análisis deportivo</p>
              <p className="mb-4 text-xs text-muted">
                Ejecutá el análisis para obtener métricas reales del video.
              </p>
              <button
                onClick={startAnalysis}
                className="inline-flex items-center gap-2 bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink/90"
              >
                <Play size={13} /> Iniciar análisis
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Ready: real data ──
  const isSolo = data.mode === "solo";
  const score = isSolo ? computeSoloScore(data.solo) : computeTeamScore(data);

  return (
    <VideoSeekProvider>
      <div className="space-y-6">
        {/* Video + Score Hero */}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <VideoHero videoUrl={videoUrl} sourceType={sourceType} sourceRef={sourceRef} title={videoTitle} initialSeconds={initialSeconds} />

        <div className="flex flex-col justify-between gap-4">
          <div className="flex items-start gap-5">
            <ScoreRing score={score} />
            <div className="flex-1">
              <span className="label text-muted">Calificación real</span>
              <p className="mt-1 text-[13px] leading-5 text-muted">
                {isSolo
                  ? "Análisis de actividad individual basado en detección de movimiento."
                  : "Análisis de deporte de equipo basado en YOLOv8."}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-sm bg-ink/5 px-2 py-0.5 text-[10px] font-medium text-ink">
                  <Radio size={10} className="text-red-500 animate-pulse" />
                  {isSolo ? "Individual" : "Equipo"}
                </span>
                {sport && sport !== "general" && (
                  <span className="inline-flex items-center rounded-sm bg-ink/5 px-2 py-0.5 text-[10px] font-medium text-ink">
                    {sportLabel(sport)}
                  </span>
                )}
                <span className="text-[10px] text-muted">
                  {data.tracking.summary.total_players_detected}{" "}
                  {isSolo
                    ? data.tracking.summary.total_players_detected === 1 ? "persona" : "personas en cuadro"
                    : "jugadores"}{" "}
                  · {data.video.duration_s.toFixed(0)}s
                  {data.tracking.summary.ghost_tracks_filtered
                    ? ` · ${data.tracking.summary.ghost_tracks_filtered} falsos positivos descartados`
                    : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Quick summary */}
          <div className="border border-hairline bg-surface p-3">
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted">
              <Sparkles size={11} /> Síntesis
            </p>
            <p className="text-[13px] leading-5 text-ink">
              {(isSolo
                ? data.solo?.narrative || data.solo?.summary || buildSoloSummary(data)
                : data.sport_narrative || buildTeamSummary(data))}
            </p>
            {/* De dónde sale la escala: sin cancha calibrada, de la altura del
                propio sujeto. Se dice para que nadie lea 24 cm como exacto. */}
            {isSolo && data.scale?.meters_per_pixel && (
              <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-muted">
                <Info size={11} className="mt-px shrink-0" />
                <span>
                  Distancias y amplitudes estimadas a partir de la altura aparente del sujeto
                  ({(data.scale.reference_person_m ?? 1.7).toFixed(2)} m de referencia)
                  {data.scale.confidence === "approx" ? "; la toma varía de encuadre, así que son aproximadas" : ""}.
                </span>
              </p>
            )}
          </div>
        </div>
      </div>

      <ActionableReport
        insights={insights}
        mode={data.mode}
        sport={data.sport}
        videoId={videoId}
        durationSeconds={data.video.duration_s}
        eventSummary={data.events.event_summary}
        players={data.tracking.players}
        highSeverityRisks={data.fatigue?.summary.high_severity_risks}
        sportLabel={sportLabel(data.sport)}
        role={role}
      />

      {/* Metrics Grid */}
      {isSolo ? <SoloMetrics solo={data.solo!} /> : <TeamMetrics data={data} />}

      {/* Sport-specific metrics */}
      {data.sport_specific && <SportSpecificMetrics data={data.sport_specific} />}

      {/* Key Moments */}
      <KeyMoments data={data} />

      {/* Tools: Coach + OKRs */}
      <div className="border border-hairline bg-surface">
        <div className="flex border-b border-hairline">
          <ToolTabButton
            active={toolTab === "coach"}
            onClick={() => setToolTab(toolTab === "coach" ? "none" : "coach")}
            icon={<MessageCircle size={13} />}
            label="Coach Virtual"
          />
          <ToolTabButton
            active={toolTab === "okrs"}
            onClick={() => setToolTab(toolTab === "okrs" ? "none" : "okrs")}
            icon={<Target size={13} />}
            label="OKRs"
          />
          <ToolTabButton
            active={toolTab === "ai"}
            onClick={() => setToolTab(toolTab === "ai" ? "none" : "ai")}
            icon={<Sparkles size={13} />}
            label="IA de visión"
          />
        </div>
        {toolTab === "coach" && (
          <div className="p-4">
            <CoachChat videoId={videoId} />
          </div>
        )}
        {toolTab === "okrs" && (
          <div className="p-4">
            <OKRDashboard videoId={videoId} />
          </div>
        )}
        {toolTab === "ai" && (
          <div className="p-4">
            <AIInsightsPanel videoId={videoId} playerCount={data.tracking.summary.total_players_detected ?? 0} />
          </div>
        )}
        {toolTab === "none" && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-muted">Elegí una herramienta arriba</p>
          </div>
        )}
        </div>
      </div>
    </VideoSeekProvider>
  );
}

// ── Sub-components ──

function VideoHero({
  videoUrl,
  sourceType,
  sourceRef,
  title,
  initialSeconds,
}: {
  videoUrl: string;
  sourceType?: string;
  sourceRef?: string | null;
  title: string;
  initialSeconds?: number;
}) {
  const [seekAttempted, setSeekAttempted] = useState(false);
  const seek = useVideoSeek();

  useEffect(() => {
    if (sourceType === "youtube" && sourceRef) {
      const embed = youtubeEmbedUrl(sourceRef);
      if (embed) seek.register(null);
    }
  }, [sourceType, sourceRef, seek]);

  if (sourceType === "youtube" && sourceRef) {
    const embed = youtubeEmbedUrl(sourceRef);
    if (embed) {
      return (
        <div className="relative border border-hairline bg-black overflow-hidden">
          <div className="aspect-video">
            <iframe
              src={embed}
              title={`Video: ${title}`}
              className="h-full w-full"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
            <p className="text-sm font-medium text-white">
              <a href={sourceRef} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {title}
              </a>
            </p>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="relative bg-black border border-hairline overflow-hidden">
      <video
        src={videoUrl}
        controls
        className="h-auto max-h-[72vh] w-full object-contain"
        crossOrigin="anonymous"
        ref={(element) => seek.register(element)}
        onLoadedMetadata={(event) => {
          if (!seekAttempted && initialSeconds !== undefined && initialSeconds > 0) {
            const video = event.currentTarget;
            video.currentTime = Math.min(initialSeconds, video.duration || initialSeconds);
            setSeekAttempted(true);
          }
        }}
      />
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
        <p className="text-sm font-medium text-white">{title}</p>
      </div>
    </div>
  );
}

function SoloMetrics({ solo }: { solo: SoloAnalysis }) {
  const { rhythm, intensity, movement, repetitions } = solo;

  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 text-base font-medium text-ink">
        <Gauge size={16} /> Métricas de actividad
      </h2>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {rhythm?.rhythm_detected && (
          <MetricCard
            icon={<Activity size={13} />}
            label="Ritmo"
            value={`${rhythm.frequency_rpm?.toFixed(0) ?? "—"} RPM`}
            sub={`${((rhythm.consistency ?? 0) * 100).toFixed(0)}% consistencia`}
          />
        )}
        {repetitions?.repetitions_detected && (
          <MetricCard
            icon={<Repeat size={13} />}
            label="Repeticiones"
            value={`${repetitions.count}`}
            sub={`${repetitions.frequency_rpm?.toFixed(0) ?? "—"} RPM`}
          />
        )}
        {/* Altura/amplitud del movimiento: la métrica que de verdad importa en
            un ejercicio repetitivo (cuánto saltás, no cuánto caminás). */}
        {rhythm?.oscillation_amplitude_m != null && (
          <MetricCard
            icon={<TrendingUp size={13} />}
            label="Amplitud"
            value={`${(rhythm.oscillation_amplitude_m * 100).toFixed(0)} cm`}
            sub="recorrido vertical"
          />
        )}
        <MetricCard
          icon={<Footprints size={13} />}
          label="Distancia"
          value={`${solo.total_distance_m?.toFixed(1) ?? "—"} m`}
        />
        <MetricCard
          icon={<Clock size={13} />}
          label="Duración"
          value={solo.duration_s !== undefined ? formatDuration(solo.duration_s) : "—"}
        />
        {solo.detailed?.rest_periods != null && solo.detailed.rest_periods > 0 && (
          <MetricCard
            icon={<PauseCircle size={13} />}
            label="Descansos"
            value={`${solo.detailed.rest_periods}`}
            sub={`${solo.detailed.avg_rest_s?.toFixed(1) ?? "—"}s promedio`}
          />
        )}
      </div>

      {/* Tendencia de intensidad: ¿sostiene el ritmo o se apaga? */}
      {solo.detailed?.intensity_trend && (
        <div className="border border-hairline bg-surface p-4">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <TrendingUp size={12} /> Tendencia durante el video
          </span>
          <p className="mt-1 text-sm text-ink">
            {trendLabel(solo.detailed.intensity_trend)}
            {solo.detailed.intensity_change_pct != null && (
              <span className="ml-1.5 text-muted">
                ({solo.detailed.intensity_change_pct > 0 ? "+" : ""}
                {solo.detailed.intensity_change_pct.toFixed(0)}% inicio vs. final)
              </span>
            )}
          </p>
          {solo.detailed.work_rest_ratio != null && (
            <p className="mt-1 text-xs text-muted">
              Trabajo {solo.detailed.work_time_s?.toFixed(0) ?? "—"}s · descanso{" "}
              {solo.detailed.total_rest_s?.toFixed(0) ?? "—"}s
            </p>
          )}
        </div>
      )}

      {/* Intensity Bar */}
      {intensity && (
        <div className="border border-hairline bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <Zap size={12} /> Intensidad
            </span>
            <span className="text-xs font-semibold text-ink">{intensity.score.toFixed(0)}/100</span>
          </div>
          <div className="relative h-2.5 overflow-hidden rounded-full bg-ink/10">
            <div
              className={`absolute inset-y-0 left-0 rounded-full ${intensityColor(intensity.level)}`}
              style={{ width: `${Math.min(100, intensity.score)}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted">
            <span>{intensityLabel(intensity.level)}</span>
            {intensity.avg_speed_mps !== undefined && (
              <span>Vel. promedio: {intensity.avg_speed_mps.toFixed(1)} m/s</span>
            )}
          </div>
        </div>
      )}

      {/* Movement Pattern */}
      {movement && movement.pattern !== "unknown" && (
        <div className="border border-hairline bg-surface p-4">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <TrendingUp size={12} /> Patrón de movimiento
          </span>
          <p className="mt-1 text-sm text-ink capitalize">{formatPattern(movement.pattern)}</p>
        </div>
      )}

      {/* Speed Zones */}
      {intensity?.speed_zones && (
        <div className="border border-hairline bg-surface p-4">
          <span className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted">
            <Flame size={12} /> Zonas de esfuerzo
          </span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {([
              { key: "very_high_pct", label: "Muy alta", color: "bg-red-500" },
              { key: "high_pct", label: "Alta", color: "bg-orange-500" },
              { key: "moderate_pct", label: "Moderada", color: "bg-amber-500" },
              { key: "low_pct", label: "Baja", color: "bg-green-500" },
            ] as const).map(({ key, label, color }) => {
              const pct = intensity.speed_zones?.[key] ?? 0;
              if (pct <= 0) return null;
              return (
                <div key={key} className="flex items-center gap-2 text-xs">
                  <span className={`h-2 w-2 rounded-full ${color}`} />
                  <span className="flex-1 text-muted">{label}</span>
                  <span className="font-mono font-medium text-ink">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TeamMetrics({ data }: { data: SportsData }) {
  const t = data.tactical;
  const f = data.fatigue?.summary;

  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 text-base font-medium text-ink">
        <BarChart3 size={16} /> Métricas del partido
      </h2>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          icon={<Users size={13} />}
          label="Jugadores"
          value={`${data.tracking.summary.total_players_detected}`}
          sub={`${data.tracking.players.filter((p) => p.team === 0).length} vs ${data.tracking.players.filter((p) => p.team === 1).length}`}
        />
        <MetricCard
          icon={<Footprints size={13} />}
          label="Eventos"
          value={`${data.events.total_events}`}
        />
        <MetricCard
          icon={<Activity size={13} />}
          label="Transiciones"
          value={`${t?.transitions.total ?? 0}`}
        />
        <MetricCard
          icon={<Clock size={13} />}
          label="Duración"
          value={formatDuration(data.video.duration_s)}
        />
      </div>

      {/* Possession */}
      {t?.possession && (
        <div className="border border-hairline bg-surface p-4">
          <span className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
            <BarChart3 size={12} /> Posesión
          </span>
          <div className="relative h-5 overflow-hidden rounded-full bg-ink/10">
            <div
              className="absolute inset-y-0 left-0 rounded-l-full bg-[#3b82f6]"
              style={{ width: `${t.possession.team_0 ?? 50}%` }}
            />
            <div
              className="absolute inset-y-0 right-0 rounded-r-full bg-[#ef4444]"
              style={{ width: `${t.possession.team_1 ?? 50}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-between px-3 text-[10px] font-bold text-white">
              <span>{t.possession.team_0 ?? 50}%</span>
              <span>{t.possession.team_1 ?? 50}%</span>
            </div>
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-muted">
            <span>{t.formations?.team_0?.formation ?? "—"}</span>
            <span>{t.formations?.team_1?.formation ?? "—"}</span>
          </div>
        </div>
      )}

      {/* Fatigue Alerts */}
      {f && (f.fatigued_players > 0 || f.total_injury_risks > 0) && (
        <div className="border border-amber-200 bg-amber-50 p-4">
          <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-800">
            <AlertTriangle size={12} /> Alertas
          </span>
          <p className="text-sm text-amber-800">
            {f.fatigued_players} jugadores con fatiga
            {f.high_severity_risks > 0 && ` · ${f.high_severity_risks} riesgos altos`}
          </p>
        </div>
      )}
    </div>
  );
}

function SportSpecificMetrics({ data }: { data: SportSpecificAnalysis }) {
  const metricLabels: Record<string, string> = {
    velocidad_maxima: "Velocidad máxima",
    botes_o_dribles: "Botes / dribles",
    jugador_con_mas_posesion: "Jugador con más posesión",
  };

  return (
    <div className="border border-hairline bg-surface p-4">
      <h2 className="mb-1 flex items-center gap-2 text-base font-medium text-ink">
        <Gauge size={16} /> Métricas específicas · {sportLabel(data.sport)}
      </h2>
      <p className="mb-3 text-xs text-muted">Análisis particular para este deporte usando el tracking del video.</p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {data.metrics.map((metric) => (
          <div key={metric.metric} className="border border-hairline bg-surface p-3">
            <div className="mb-1 flex items-center justify-between text-[10px] text-muted">
              <span>{metricLabels[metric.metric] || metric.metric}</span>
              {metric.computed ? (
                <span className="font-medium text-green-600">calculado</span>
              ) : (
                <span className="font-medium text-amber-600">no calculado</span>
              )}
            </div>
            <p className="text-sm font-semibold text-ink">
              {metric.value === null || metric.value === undefined ? "—" : `${metric.value} ${metric.unit}`}
            </p>
            {metric.computed && (
              <p className="text-[10px] text-muted">confianza {(metric.confidence * 100).toFixed(0)}%</p>
            )}
          </div>
        ))}
      </div>

      {data.limitations.length > 0 && (
        <div className="mt-3 border border-amber-200 bg-amber-50 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-800">
            <Info size={12} /> Por qué no se pudo medir todo
          </p>
          <ul className="space-y-1">
            {data.limitations.map((limitation, i) => (
              <li key={i} className="text-[12px] leading-4 text-amber-800">
                · {limitation}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function sportLabel(sport: string): string {
  const map: Record<string, string> = {
    futbol: "Fútbol",
    baloncesto: "Baloncesto",
    voleibol: "Voleibol",
    padel: "Pádel",
    general: "General",
  };
  return map[sport] || sport;
}
  function KeyMoments({ data }: { data: SportsData }) {
  const events = data.events.event_summary;
  const entries = Object.entries(events);
  if (entries.length === 0 && data.mode === "solo") {
    return (
      <div className="border border-hairline bg-surface p-4">
        <h2 className="mb-2 flex items-center gap-2 text-base font-medium text-ink">
          <Sparkles size={16} /> Momentos clave
        </h2>
        <p className="text-sm text-muted">
          {data.solo?.repetitions?.repetitions_detected
            ? `${data.solo.repetitions.count} repeticiones detectadas con ritmo de ${data.solo.repetitions.frequency_rpm?.toFixed(0) ?? "—"} RPM.`
            : "Actividad detectada sin eventos significativos."}
        </p>
      </div>
    );
  }

  if (entries.length === 0) return null;

  const eventLabels: Record<string, string> = {
    sprint_spike: "Sprint",
    player_cluster: "Agrupación",
    ball_out_of_frame: "Balón fuera",
    ball_stopped: "Balón detenido",
    high_pressure: "Presión alta",
    possession_change: "Cambio de posesión",
  };

  return (
    <div className="border border-hairline bg-surface p-4">
      <h2 className="mb-3 flex items-center gap-2 text-base font-medium text-ink">
        <Sparkles size={16} /> Eventos detectados
      </h2>
      <div className="space-y-1.5">
        {entries.map(([type, count]) => (
          <div key={type} className="flex items-center justify-between text-sm">
            <span className="text-muted">{eventLabels[type] || type}</span>
            <span className="font-mono font-semibold text-ink">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="border border-hairline bg-surface p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted">
        {icon}
        {label}
      </div>
      <p className="text-sm font-semibold text-ink">{value}</p>
      {sub && <p className="text-[10px] text-muted">{sub}</p>}
    </div>
  );
}

function ToolTabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
        active ? "text-ink border-b-2 border-ink" : "text-muted hover:text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Helpers ──

function computeSoloScore(solo?: SoloAnalysis): number {
  if (!solo) return 50;
  // El puntaje premia lo que se puede verificar: que haya ritmo medible, que
  // sea constante, que el sujeto sostenga el esfuerzo. No premia "moverse
  // mucho", porque saltar la cuerda en el lugar es poco desplazamiento y mucho
  // trabajo.
  let score = 30;
  if (solo.intensity?.score) score += solo.intensity.score * 0.25;
  if (solo.rhythm?.rhythm_detected) score += 12;
  if (solo.rhythm?.consistency) score += solo.rhythm.consistency * 12;
  if (solo.repetitions?.repetitions_detected) score += Math.min(14, solo.repetitions.count * 0.35);
  const trend = solo.detailed?.intensity_trend;
  if (trend === "estable") score += 8;
  else if (trend === "descendente") score -= 4;
  return Math.min(98, Math.max(20, Math.round(score)));
}

function computeTeamScore(data: SportsData): number {
  let score = 40;
  const p = data.tactical?.possession;
  if (p) {
    const balance = 100 - Math.abs((p.team_0 ?? 50) - 50) * 2;
    score += balance * 0.2;
  }
  score += Math.min(15, data.events.total_events * 0.5);
  if (data.fatigue?.summary) {
    score -= data.fatigue.summary.high_severity_risks * 3;
  }
  return Math.min(95, Math.max(25, Math.round(score)));
}

function buildSoloSummary(data: SportsData): string {
  const s = data.solo;
  if (!s) return "Actividad detectada.";
  // El pipeline arma una narrativa con las métricas que sí pudo medir; si no
  // está, se compone una desde los datos disponibles.
  if (s.narrative) return s.narrative;
  const parts: string[] = [];
  if (s.intensity?.level) parts.push(`Intensidad ${intensityLabel(s.intensity.level).toLowerCase()}`);
  if (s.rhythm?.rhythm_detected) parts.push(`ritmo de ${s.rhythm.frequency_rpm?.toFixed(0)} RPM`);
  if (s.repetitions?.repetitions_detected) parts.push(`${s.repetitions.count} repeticiones`);
  if (s.total_distance_m) parts.push(`${s.total_distance_m.toFixed(1)}m recorridos`);
  return parts.length > 0 ? parts.join(", ") + "." : "Actividad detectada.";
}

function buildTeamSummary(data: SportsData): string {
  const t = data.tactical;
  const parts: string[] = [];
  if (t?.possession) parts.push(`Posesión ${t.possession.team_0 ?? 50}/${t.possession.team_1 ?? 50}`);
  if (t?.transitions) parts.push(`${t.transitions.total} transiciones`);
  if (data.events.total_events) parts.push(`${data.events.total_events} eventos`);
  return parts.length > 0 ? parts.join(". ") + "." : "Análisis de equipo completado.";
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function trendLabel(trend: string): string {
  if (trend === "descendente") return "La intensidad cae hacia el final";
  if (trend === "ascendente") return "La intensidad sube hacia el final";
  return "Ritmo sostenido y estable";
}

function intensityColor(level: string): string {
  if (level === "very_high") return "bg-red-500";
  if (level === "high") return "bg-orange-500";
  if (level === "moderate") return "bg-amber-500";
  return "bg-green-500";
}

function intensityLabel(level: string): string {
  if (level === "very_high") return "Muy alta";
  if (level === "high") return "Alta";
  if (level === "moderate") return "Moderada";
  if (level === "low") return "Baja";
  if (level === "rest") return "Descanso";
  return level;
}

function formatPattern(pattern: string): string {
  const map: Record<string, string> = {
    stationary: "En zona fija",
    linear: "Movimiento lineal",
    oscillating: "Movimiento oscilatorio",
    moderate_movement: "Movimiento moderado",
  };
  return map[pattern] || pattern;
}
