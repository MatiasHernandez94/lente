"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Eye,
  EyeOff,
  Flame,
  Footprints,
  Layers,
  Maximize2,
  Minimize2,
  Play,
  Radio,
  Settings,
  Users,
  Zap,
} from "lucide-react";
import { VideoOverlay, useOverlaySettings } from "./VideoOverlay";
import { TacticalBoard } from "./TacticalBoard";
import { MetricsDashboard } from "./MetricsDashboard";

type AnalysisStatus = "loading" | "none" | "ready" | "error";

interface FrameData {
  frame: number;
  time_s: number;
  players: Array<{
    id: number;
    team: number;
    center: [number, number];
    bbox: [number, number, number, number];
    speed_mps?: number;
    name?: string;
  }>;
  ball: { center: [number, number] } | null;
}

interface SportAnalysis {
  mode?: "solo" | "team";
  video: { width: number; height: number; fps: number; duration_s: number };
  frames?: FrameData[];
  tracking: {
    summary: { total_players_detected: number; teams: { team_0: number; team_1: number } };
    players: Array<{
      id: number; team: number;
      avg_speed_mps: number; max_speed_mps: number; total_distance_m: number;
    }>;
  };
  events: {
    total_events: number;
    event_summary: Record<string, number>;
    events: Array<{ time_s: number; type: string }>;
  };
  tactical: {
    formations: Record<string, { formation: string }>;
    possession: Record<string, number>;
    pressing: Record<string, { intensity: string }>;
    transitions: { total: number };
    heatmaps: Record<string, number[][]>;
  };
  fatigue: {
    players: Record<string, {
      fatigue: { fatigue_detected: boolean; fatigue_score: number; speed_decline_pct: number };
      injury_risks: Array<{ type: string; severity: string; time_s: number }>;
    }>;
    summary: { fatigued_players: number; total_injury_risks: number; high_severity_risks: number };
  };
  solo?: {
    activity_detected: boolean;
    primary_person_id?: number;
    total_persons?: number;
    duration_s?: number;
    total_distance_m?: number;
    rhythm?: { rhythm_detected: boolean; frequency_hz?: number; frequency_rpm?: number; consistency?: number };
    intensity?: { level: string; score: number; avg_speed_mps?: number; max_speed_mps?: number; active_time_ratio?: number; speed_zones?: Record<string, number> };
    movement?: { pattern: string; details?: Record<string, unknown> };
    repetitions?: { repetitions_detected: boolean; count: number; avg_interval_s?: number; rhythm_consistency?: number; frequency_hz?: number; frequency_rpm?: number };
    summary?: string;
  };
  processing_time_s: number;
}

interface Props {
  videoId: string;
  videoUrl: string;
  sport: string;
}

type ViewMode = "overlay" | "tactical" | "dashboard";

export function SportsAnalysisViewerFull({ videoId, videoUrl, sport }: Props) {
  const [status, setStatus] = useState<AnalysisStatus>("loading");
  const [analysis, setAnalysis] = useState<SportAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("overlay");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const overlay = useOverlaySettings();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // El overlay dibuja sobre el video, así que necesita los frames por
        // muestra; el resto de la UI usa la misma respuesta sin pedirlos.
        const res = await fetch(`/api/videos/${videoId}/sports?include=frames`);
        if (!res.ok) throw new Error("Error");
        const data = await res.json();
        if (cancelled) return;
        setStatus(data.status);
        if (data.analysis) setAnalysis(data.analysis);
      } catch {
        if (cancelled) return;
        setError("Error al cargar el análisis deportivo");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  const startAnalysis = async () => {
    setStatus("loading");
    try {
      const res = await fetch(`/api/videos/${videoId}/sports`, { method: "POST" });
      if (!res.ok) throw new Error("Error");
      const data = await res.json();
      setStatus(data.status);
      if (data.analysis) setAnalysis(data.analysis);
    } catch {
      setError("Error al iniciar el análisis");
      setStatus("error");
    }
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  if (status === "loading") {
    return (
      <div className="border border-hairline bg-surface p-16 text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
        <p className="text-sm font-medium text-ink">Procesando análisis deportivo</p>
        <p className="mt-1 text-xs text-muted">YOLOv8 + OpenCV · Puede tomar 1-2 minutos</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="border border-red-200 bg-red-50 p-10 text-center">
        <AlertTriangle className="mx-auto mb-3 text-red-500" size={32} />
        <p className="text-sm text-red-700">{error}</p>
        <button onClick={startAnalysis} className="mt-4 border border-ink/20 px-5 py-2 text-sm text-ink hover:bg-surface">
          Reintentar
        </button>
      </div>
    );
  }

  if (status === "none" || !analysis) {
    return (
      <div className="border border-hairline bg-surface p-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-ink/5">
          <BarChart3 className="text-ink" size={28} />
        </div>
        <p className="mb-2 text-base font-medium text-ink">Análisis deportivo completo</p>
        <p className="mb-6 max-w-md mx-auto text-xs text-muted">
          Detección de jugadores con YOLOv8, análisis táctico, eventos, fatiga y overlays estilo broadcast.
        </p>
        <button
          onClick={startAnalysis}
          className="inline-flex items-center gap-2 bg-ink px-6 py-3 text-sm font-medium text-white shadow-lg hover:bg-ink/90 transition-all"
        >
          <Play size={14} />
          Iniciar análisis
        </button>
      </div>
    );
  }

  const overlayData = { video: analysis.video, frames: analysis.frames || [] };
  const hasFrames = !!(analysis.frames && analysis.frames.length > 0);

  const tacticalPlayers = analysis.frames?.[0]?.players.map((p) => ({
    x: p.center[0] / analysis.video.width,
    y: p.center[1] / analysis.video.height,
    team: p.team,
    id: p.id,
    name: p.name,
    speed: p.speed_mps,
  })) || [];

  return (
    <div ref={containerRef} className="space-y-3">
      {/* Broadcast Header Bar */}
      <div className="flex items-center justify-between border border-hairline bg-ink px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Radio size={12} className="text-red-500 animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-white">LIVE</span>
          </div>
          <div className="h-4 w-px bg-white/20" />
          <span className="text-[11px] font-medium text-white/80">
            {analysis.mode === "solo"
              ? `${analysis.solo?.total_persons ?? 1} persona detectada`
              : `${analysis.tracking.summary.total_players_detected} jugadores detectados`}
          </span>
          <span className="text-[11px] text-white/50">
            · {analysis.video.fps} FPS · {analysis.video.duration_s.toFixed(0)}s
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/40">Procesado en {analysis.processing_time_s.toFixed(1)}s</span>
          <button
            onClick={toggleFullscreen}
            className="p-1 text-white/60 hover:text-white transition-colors"
            title={isFullscreen ? "Salir" : "Pantalla completa"}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex items-center gap-1 border border-hairline bg-surface px-2 py-1.5">
        <TabButton active={viewMode === "overlay"} onClick={() => setViewMode("overlay")} icon={<Layers size={13} />}>
          Overlay
        </TabButton>
        {analysis.mode !== "solo" && (
          <TabButton active={viewMode === "tactical"} onClick={() => setViewMode("tactical")} icon={<Users size={13} />}>
            Táctico
          </TabButton>
        )}
        <TabButton active={viewMode === "dashboard"} onClick={() => setViewMode("dashboard")} icon={<BarChart3 size={13} />}>
          Dashboard
        </TabButton>

        {viewMode === "overlay" && hasFrames && (
          <div className="ml-auto flex items-center gap-0.5">
            <OverlayToggle active={overlay.settings.showLabels} onClick={overlay.toggleLabels} title="Jugadores">
              <Users size={12} />
            </OverlayToggle>
            <OverlayToggle active={overlay.settings.showTrajectories} onClick={overlay.toggleTrajectories} title="Trayectorias">
              <Footprints size={12} />
            </OverlayToggle>
            <OverlayToggle active={overlay.settings.showSpeed} onClick={overlay.toggleSpeed} title="Velocidad">
              <Zap size={12} />
            </OverlayToggle>
            <OverlayToggle active={overlay.settings.showBall} onClick={overlay.toggleBall} title="Balón">
              <div className="h-2.5 w-2.5 rounded-full border-[1.5px] border-current" />
            </OverlayToggle>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Video / Tactical Board */}
        <div className={`${viewMode === "overlay" ? "lg:col-span-2" : "lg:col-span-2"}`}>
          {(viewMode === "overlay" || viewMode === "dashboard") && (
            <div className="relative bg-black border border-hairline overflow-hidden">
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                className="w-full"
                crossOrigin="anonymous"
              />
              {viewMode === "overlay" && hasFrames && (
                <VideoOverlay
                  videoRef={videoRef}
                  data={overlayData}
                  settings={overlay.settings}
                />
              )}
              {/* Broadcast Score Bug (team mode only) */}
              {analysis.mode !== "solo" && (
                <>
                  <div className="absolute top-3 left-3 flex items-center gap-0 bg-black/80 backdrop-blur-sm border border-white/10">
                    <div className="flex items-center gap-2 px-3 py-1.5">
                      <span className="inline-block h-2 w-2 rounded-full bg-[#3b82f6]" />
                      <span className="text-[11px] font-bold text-white">A</span>
                    </div>
                    <div className="bg-white/10 px-2 py-1.5">
                      <span className="text-[11px] font-bold text-white">
                        {analysis.tactical?.possession.team_0 ?? 50}
                      </span>
                    </div>
                    <div className="bg-white/10 px-2 py-1.5">
                      <span className="text-[11px] font-bold text-white">
                        {analysis.tactical?.possession.team_1 ?? 50}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5">
                      <span className="text-[11px] font-bold text-white">B</span>
                      <span className="inline-block h-2 w-2 rounded-full bg-[#ef4444]" />
                    </div>
                  </div>
                  {/* Formation Overlay */}
                  <div className="absolute top-3 right-3 bg-black/80 backdrop-blur-sm border border-white/10 px-3 py-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/80">
                      {analysis.tactical?.formations.team_0?.formation ?? "—"} vs {analysis.tactical?.formations.team_1?.formation ?? "—"}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {viewMode === "tactical" && (
            <div className="border border-hairline overflow-hidden">
              <TacticalBoard
                width={700}
                players={tacticalPlayers}
                formation={analysis.tactical?.formations.team_0?.formation}
                possession={{
                  team0: analysis.tactical?.possession.team_0 ?? 50,
                  team1: analysis.tactical?.possession.team_1 ?? 50,
                }}
                heatmap={analysis.tactical?.heatmaps?.team_0}
              />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          {viewMode === "overlay" && analysis.mode !== "solo" && (
            <>
              <StatsGrid analysis={analysis} />
              <PossessionBar analysis={analysis} />
              <EventSummary analysis={analysis} />
            </>
          )}

          {viewMode === "overlay" && analysis.mode === "solo" && analysis.solo && (
            <div className="border border-hairline bg-surface p-3">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted">Resumen</p>
              <p className="text-sm text-ink">{analysis.solo.summary || "Actividad detectada"}</p>
              {analysis.solo.intensity && (
                <p className="mt-2 text-xs text-muted">
                  Intensidad: {analysis.solo.intensity.level} · Score {analysis.solo.intensity.score.toFixed(0)}/100
                </p>
              )}
            </div>
          )}

          {viewMode === "tactical" && (
            <>
              <TacticalInfoPanel analysis={analysis} />
            </>
          )}

          {viewMode === "dashboard" && (
            <MetricsDashboard
              players={analysis.tracking.players}
              events={analysis.events.events.map((e) => ({ ...e, description: undefined }))}
              fatigue={Object.values(analysis.fatigue.players).map((p) => ({
                ...p.fatigue,
                injury_risks: p.injury_risks,
              }))}
              tactical={analysis.tactical}
              duration={analysis.video.duration_s}
              solo={analysis.solo}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-all ${
        active
          ? "bg-ink text-white shadow-sm"
          : "text-muted hover:text-ink hover:bg-ink/5"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function OverlayToggle({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 transition-colors ${
        active ? "text-white bg-white/10" : "text-white/40 hover:text-white/70"
      }`}
    >
      {children}
    </button>
  );
}

function StatsGrid({ analysis }: { analysis: SportAnalysis }) {
  const stats = [
    {
      icon: <Users size={13} />,
      value: analysis.tracking.summary.total_players_detected,
      label: "Jugadores",
      sub: `${analysis.tracking.summary.teams.team_0} vs ${analysis.tracking.summary.teams.team_1}`,
    },
    {
      icon: <Footprints size={13} />,
      value: analysis.events.total_events,
      label: "Eventos",
      sub: Object.keys(analysis.events.event_summary).slice(0, 2).join(", ") || "—",
    },
    {
      icon: <Activity size={13} />,
      value: analysis.tactical.transitions.total,
      label: "Transiciones",
      sub: "Cambios de posesión",
    },
    {
      icon: <Flame size={13} />,
      value: analysis.fatigue.summary.fatigued_players,
      label: "Fatiga",
      sub: `${analysis.fatigue.summary.total_injury_risks} riesgos`,
      warning: analysis.fatigue.summary.high_severity_risks > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {stats.map((s) => (
        <div key={s.label} className="border border-hairline bg-surface p-2.5">
          <div className="mb-1 flex items-center gap-1 text-[10px] text-muted">
            {s.icon}
            {s.label}
          </div>
          <p className={`text-lg font-bold ${s.warning ? "text-amber-600" : "text-ink"}`}>{s.value}</p>
          <p className="text-[10px] text-muted">{s.sub}</p>
        </div>
      ))}
    </div>
  );
}

function PossessionBar({ analysis }: { analysis: SportAnalysis }) {
  const t0 = analysis.tactical?.possession.team_0 ?? 50;
  const t1 = analysis.tactical?.possession.team_1 ?? 50;

  return (
    <div className="border border-hairline bg-surface p-3">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted">Posesión</p>
      <div className="relative h-5 overflow-hidden rounded-full bg-ink/10">
        <div
          className="absolute inset-y-0 left-0 rounded-l-full transition-all"
          style={{ width: `${t0}%`, background: "#3b82f6" }}
        />
        <div
          className="absolute inset-y-0 right-0 rounded-r-full transition-all"
          style={{ width: `${t1}%`, background: "#ef4444" }}
        />
        <div className="absolute inset-0 flex items-center justify-between px-3 text-[10px] font-bold text-white">
          <span>{t0}%</span>
          <span>{t1}%</span>
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[9px] text-muted">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#3b82f6]" />
          Equipo A · {analysis.tactical?.formations.team_0?.formation ?? "—"}
        </span>
        <span className="flex items-center gap-1">
          Equipo B · {analysis.tactical?.formations.team_1?.formation ?? "—"}
          <span className="h-1.5 w-1.5 rounded-full bg-[#ef4444]" />
        </span>
      </div>
    </div>
  );
}

function EventSummary({ analysis }: { analysis: SportAnalysis }) {
  const events = Object.entries(analysis.events.event_summary);
  if (events.length === 0) return null;

  return (
    <div className="border border-hairline bg-surface p-3">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted">Eventos detectados</p>
      <div className="space-y-1.5">
        {events.map(([type, count]) => (
          <div key={type} className="flex items-center justify-between text-xs">
            <span className="text-muted">{formatEventType(type)}</span>
            <span className="font-mono font-bold text-ink">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TacticalInfoPanel({ analysis }: { analysis: SportAnalysis }) {
  return (
    <div className="space-y-3">
      <div className="border border-hairline bg-surface p-3">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted">Formaciones</p>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-ink">
              <span className="h-2 w-2 rounded-full bg-[#3b82f6]" />
              Equipo A
            </span>
            <span className="font-mono font-bold">{analysis.tactical?.formations.team_0?.formation ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-ink">
              <span className="h-2 w-2 rounded-full bg-[#ef4444]" />
              Equipo B
            </span>
            <span className="font-mono font-bold">{analysis.tactical?.formations.team_1?.formation ?? "—"}</span>
          </div>
        </div>
      </div>

      <div className="border border-hairline bg-surface p-3">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted">Presión</p>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink">Equipo A</span>
            <span className={`font-medium ${
              analysis.tactical?.pressing.team_0?.intensity === "high" ? "text-amber-600" : "text-ink"
            }`}>
              {analysis.tactical?.pressing.team_0?.intensity ?? "—"}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink">Equipo B</span>
            <span className={`font-medium ${
              analysis.tactical?.pressing.team_1?.intensity === "high" ? "text-amber-600" : "text-ink"
            }`}>
              {analysis.tactical?.pressing.team_1?.intensity ?? "—"}
            </span>
          </div>
        </div>
      </div>

      <div className="border border-hairline bg-surface p-3">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted">Transiciones</p>
        <p className="text-2xl font-bold text-ink">{analysis.tactical?.transitions.total ?? 0}</p>
        <p className="text-[10px] text-muted">Cambios de posesión detectados</p>
      </div>

      {analysis.fatigue.summary.fatigued_players > 0 && (
        <div className="border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={12} className="text-amber-600" />
            <p className="text-[10px] font-medium uppercase tracking-wider text-amber-800">Alertas</p>
          </div>
          <p className="text-sm font-medium text-amber-800">
            {analysis.fatigue.summary.fatigued_players} jugadores con fatiga
          </p>
          {analysis.fatigue.summary.high_severity_risks > 0 && (
            <p className="text-xs text-amber-700">
              {analysis.fatigue.summary.high_severity_risks} riesgos de alta severidad
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function formatEventType(type: string): string {
  const map: Record<string, string> = {
    sprint_spike: "Sprints",
    player_cluster: "Agrupaciones",
    ball_out_of_frame: "Balón fuera",
    ball_stopped: "Balón detenido",
    high_pressure: "Presión alta",
    possession_change: "Cambio posesión",
  };
  return map[type] || type;
}
