"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Flame,
  Footprints,
  Map,
  Play,
  Users,
} from "lucide-react";

const waitForAnalysis = async (
  url: string,
  intervalMs = 8000,
  timeoutMs = 900_000,
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.status === "ready") return true;
      if (data.status === "error") return false;
    } catch {
      // reintentar
    }
  }
  return false;
};

type AnalysisStatus = "loading" | "none" | "ready" | "error" | "queued";

interface SportAnalysis {
  video: {
    width: number;
    height: number;
    fps: number;
    duration_s: number;
  };
  tracking: {
    summary: {
      total_players_detected: number;
      teams: { team_0: number; team_1: number };
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
    events: Array<{
      time_s: number;
      type: string;
    }>;
  };
  tactical: {
    formations: Record<string, { formation: string }>;
    possession: Record<string, number>;
    pressing: Record<string, { intensity: string }>;
    transitions: { total: number };
  };
  fatigue: {
    summary: {
      fatigued_players: number;
      total_injury_risks: number;
      high_severity_risks: number;
    };
  };
  processing_time_s: number;
}

interface Props {
  videoId: string;
  sport: string;
}

export function SportsAnalysisViewer({ videoId, sport: _sport }: Props) {
  const [status, setStatus] = useState<AnalysisStatus>("loading");
  const [analysis, setAnalysis] = useState<SportAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollingStartedRef = useRef(false);

  const loadAnalysis = useCallback(async () => {
    try {
      const res = await fetch(`/api/videos/${videoId}/sports`);
      if (!res.ok) throw new Error("Error fetching");
      const data = await res.json();
      if (data.analysis) setAnalysis(data.analysis);
      if (data.status === "ready") {
        pollingStartedRef.current = false;
        setStatus("ready");
        return;
      }
      if (data.status === "error") {
        pollingStartedRef.current = false;
        setError(data.error ?? "El análisis falló.");
        setStatus("error");
        return;
      }
      if (data.status === "queued") {
        setStatus("queued");
        return;
      }
      pollingStartedRef.current = false;
      setStatus("none");
    } catch {
      setError("Error al cargar análisis");
      setStatus("error");
    }
  }, [videoId]);

  useEffect(() => {
    const task = setTimeout(() => {
      void loadAnalysis();
    }, 0);
    return () => clearTimeout(task);
  }, [loadAnalysis]);

  useEffect(() => {
    if (status !== "queued" || pollingStartedRef.current) return;
    pollingStartedRef.current = true;
    const timer = setTimeout(async () => {
      const done = await waitForAnalysis(`/api/videos/${videoId}/sports`);
      pollingStartedRef.current = false;
      if (!done) {
        setError("Tiempo de espera agotado mientras se procesaba el análisis.");
        setStatus("error");
        return;
      }
      void loadAnalysis();
    }, 5000);
    return () => clearTimeout(timer);
  }, [status, videoId, loadAnalysis]);

  const startAnalysis = async () => {
    setStatus("loading");
    try {
      const res = await fetch(`/api/videos/${videoId}/sports`, { method: "POST" });
      if (!res.ok) throw new Error("Error starting");
      const data = await res.json();
      if (data.status === "queued") {
        setStatus("queued");
        const done = await waitForAnalysis(`/api/videos/${videoId}/sports`);
        if (!done) {
          setError("Tiempo de espera agotado mientras se procesaba el análisis.");
          setStatus("error");
          return;
        }
        await loadAnalysis();
        return;
      }
      setStatus(data.status);
      if (data.analysis) setAnalysis(data.analysis);
    } catch {
      setError("Error al iniciar análisis");
      setStatus("error");
    }
  };

  if (status === "loading" || status === "queued") {
    return (
      <div className="border border-hairline bg-surface p-8 text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
        <p className="text-sm text-muted">
          {status === "queued"
            ? "Análisis en cola de procesamiento. Esto puede tardar varios minutos mientras el worker externo procesa el video…"
            : "Procesando análisis deportivo..."}
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="border border-red-200 bg-red-50 p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 text-red-500" size={24} />
        <p className="text-sm text-red-700">{error}</p>
        <button
          onClick={startAnalysis}
          className="mt-4 border border-ink/20 px-4 py-2 text-sm text-ink hover:bg-surface"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (status === "none" || !analysis) {
    return (
      <div className="border border-hairline bg-surface p-8 text-center">
        <BarChart3 className="mx-auto mb-4 text-muted" size={32} />
        <p className="mb-4 text-sm text-muted">
          Análisis deportivo completo: detección de jugadores, eventos, táctica y fatiga.
        </p>
        <button
          onClick={startAnalysis}
          className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-ink/90"
        >
          <Play size={14} />
          Iniciar análisis
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-xs text-muted">
        <span>Análisis completado en {analysis.processing_time_s.toFixed(1)}s</span>
        <span>·</span>
        <span>{analysis.video.fps} FPS</span>
        <span>·</span>
        <span>{analysis.video.duration_s.toFixed(0)}s</span>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          icon={<Users size={16} />}
          label="Jugadores"
          value={analysis.tracking.summary.total_players_detected}
          sub={`${analysis.tracking.summary.teams.team_0} vs ${analysis.tracking.summary.teams.team_1}`}
        />
        <StatCard
          icon={<Footprints size={16} />}
          label="Eventos"
          value={analysis.events.total_events}
          sub={Object.keys(analysis.events.event_summary).join(", ") || "Sin eventos"}
        />
        <StatCard
          icon={<Map size={16} />}
          label="Transiciones"
          value={analysis.tactical.transitions.total}
          sub={analysis.tactical.formations.team_0?.formation ?? "—"}
        />
        <StatCard
          icon={<Flame size={16} />}
          label="Fatiga"
          value={`${analysis.fatigue.summary.fatigued_players} jugadores`}
          sub={`${analysis.fatigue.summary.total_injury_risks} riesgos`}
          warning={analysis.fatigue.summary.high_severity_risks > 0}
        />
      </div>

      <TacticalSection tactical={analysis.tactical} />
      <FatigueSection fatigue={analysis.fatigue} />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  warning,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  warning?: boolean;
}) {
  return (
    <div className="border border-hairline bg-surface p-4">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted">
        {icon}
        {label}
      </div>
      <p className="text-lg font-semibold text-ink">{value}</p>
      <p className={`mt-1 text-xs ${warning ? "text-amber-600" : "text-muted"}`}>{sub}</p>
    </div>
  );
}

function TacticalSection({
  tactical,
}: {
  tactical: SportAnalysis["tactical"];
}) {
  return (
    <div className="border border-hairline bg-surface p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-ink">
        <Map size={15} />
        Análisis Táctico
      </h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <p className="mb-2 text-xs text-muted">Formaciones</p>
          {Object.entries(tactical.formations).map(([team, f]) => (
            <div key={team} className="flex items-center gap-2 text-sm text-ink">
              <span className="text-xs text-muted">{team}:</span>
              <span className="font-mono font-medium">{f.formation}</span>
            </div>
          ))}
        </div>

        <div>
          <p className="mb-2 text-xs text-muted">Posesión</p>
          {Object.entries(tactical.possession).map(([team, pct]) => (
            <div key={team} className="flex items-center gap-2 text-sm text-ink">
              <div className="h-2 w-2 rounded-full bg-ink/30" />
              <span>{pct}%</span>
            </div>
          ))}
        </div>

        <div>
          <p className="mb-2 text-xs text-muted">Presión</p>
          {Object.entries(tactical.pressing).map(([team, p]) => (
            <div key={team} className="flex items-center gap-2 text-sm text-ink">
              <span className="text-xs text-muted">{team}:</span>
              <span className={`font-medium ${p.intensity === "high" ? "text-amber-600" : ""}`}>
                {p.intensity}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FatigueSection({
  fatigue,
}: {
  fatigue: SportAnalysis["fatigue"];
}) {
  return (
    <div className="border border-hairline bg-surface p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-ink">
        <Activity size={15} />
        Detección de Fatiga
      </h3>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div>
          <p className="text-xs text-muted">Jugadores fatigados</p>
          <p className="text-lg font-semibold text-ink">{fatigue.summary.fatigued_players}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Riesgos totales</p>
          <p className="text-lg font-semibold text-ink">{fatigue.summary.total_injury_risks}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Alta severidad</p>
          <p className={`text-lg font-semibold ${fatigue.summary.high_severity_risks > 0 ? "text-red-600" : "text-ink"}`}>
            {fatigue.summary.high_severity_risks}
          </p>
        </div>
      </div>
    </div>
  );
}
