"use client";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Clock,
  Footprints,
  Gauge,
  Heart,
  MapPin,
  Repeat,
  TrendingDown,
  Zap,
} from "lucide-react";

interface SoloData {
  activity_detected: boolean;
  duration_s?: number;
  total_distance_m?: number;
  rhythm?: {
    rhythm_detected: boolean;
    frequency_hz?: number;
    frequency_rpm?: number;
    consistency?: number;
    oscillation_amplitude_px?: number;
    oscillation_peaks?: number;
  };
  intensity?: {
    level: string;
    score: number;
    avg_speed_mps?: number;
    max_speed_mps?: number;
    active_time_ratio?: number;
    speed_zones?: Record<string, number>;
  };
  movement?: {
    pattern: string;
    details?: Record<string, unknown>;
  };
  repetitions?: {
    repetitions_detected: boolean;
    count: number;
    avg_interval_s?: number;
    rhythm_consistency?: number;
    frequency_hz?: number;
    frequency_rpm?: number;
  };
  summary?: string;
}

interface PlayerStats {
  id: number;
  team: number;
  name?: string;
  avg_speed_mps: number;
  max_speed_mps: number;
  total_distance_m: number;
  sprint_count?: number;
}

interface Event {
  time_s: number;
  type: string;
  description?: string;
}

interface FatigueData {
  fatigue_detected: boolean;
  fatigue_score: number;
  speed_decline_pct: number;
  injury_risks: Array<{
    type: string;
    severity: string;
    time_s: number;
  }>;
}

interface TacticalData {
  formations: Record<string, { formation: string }>;
  possession: Record<string, number>;
  pressing: Record<string, { intensity: string }>;
  transitions: { total: number };
}

interface MetricsDashboardProps {
  players: PlayerStats[];
  events: Event[];
  fatigue: FatigueData[];
  tactical: TacticalData;
  teamColors?: [string, string];
  duration: number;
  solo?: SoloData;
}

function IntensityBar({ level, score }: { level: string; score: number }) {
  const color =
    level === "very_high" ? "bg-red-500" :
    level === "high" ? "bg-orange-500" :
    level === "moderate" ? "bg-amber-500" :
    "bg-green-500";
  const label =
    level === "very_high" ? "Muy alta" :
    level === "high" ? "Alta" :
    level === "moderate" ? "Moderada" :
    level === "low" ? "Baja" :
    "Descanso";

  return (
    <div className="border border-hairline bg-surface p-4">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-medium text-muted">
        <Gauge size={13} />
        Intensidad del ejercicio
      </h3>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="relative h-3 overflow-hidden rounded-full bg-ink/10">
            <div
              className={`absolute inset-y-0 left-0 rounded-full ${color}`}
              style={{ width: `${Math.min(100, score)}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted">
            <span>{label}</span>
            <span>{score.toFixed(0)}/100</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SoloStats({ solo }: { solo: SoloData }) {
  const { rhythm, intensity, movement, repetitions } = solo;

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {rhythm?.rhythm_detected && (
          <div className="border border-hairline bg-surface p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted">
              <Activity size={13} />
              Ritmo
            </div>
            <p className="text-sm font-semibold text-ink">
              {rhythm.frequency_rpm?.toFixed(0) ?? "—"}
              <span className="ml-1 text-[10px] font-normal text-muted">RPM</span>
            </p>
            <p className="text-[10px] text-muted">
              {rhythm.consistency !== undefined
                ? `${(rhythm.consistency * 100).toFixed(0)}% consistencia`
                : ""}
            </p>
          </div>
        )}
        {repetitions?.repetitions_detected && (
          <div className="border border-hairline bg-surface p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted">
              <Repeat size={13} />
              Repeticiones
            </div>
            <p className="text-sm font-semibold text-ink">{repetitions.count}</p>
            <p className="text-[10px] text-muted">
              {repetitions.frequency_rpm?.toFixed(0) ?? "—"} RPM
            </p>
          </div>
        )}
        <div className="border border-hairline bg-surface p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted">
            <Footprints size={13} />
            Distancia
          </div>
          <p className="text-sm font-semibold text-ink">
            {solo.total_distance_m?.toFixed(1) ?? "—"}
            <span className="ml-1 text-[10px] font-normal text-muted">m</span>
          </p>
        </div>
        <div className="border border-hairline bg-surface p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted">
            <Clock size={13} />
            Duración
          </div>
          <p className="text-sm font-semibold text-ink">
            {solo.duration_s !== undefined
              ? `${Math.floor(solo.duration_s / 60)}:${String(Math.floor(solo.duration_s % 60)).padStart(2, "0")}`
              : "—"}
          </p>
        </div>
      </div>

      {/* Intensity */}
      {intensity && <IntensityBar level={intensity.level} score={intensity.score} />}

      {/* Movement Pattern */}
      {movement && movement.pattern !== "unknown" && (
        <div className="border border-hairline bg-surface p-4">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-medium text-muted">
            <MapPin size={13} />
            Patrón de movimiento
          </h3>
          <p className="text-sm text-ink capitalize">
            {movement.pattern === "stationary" ? "En zona fija" :
             movement.pattern === "linear" ? "Movimiento lineal" :
             movement.pattern === "oscillating" ? "Movimiento oscilatorio" :
             movement.pattern === "moderate_movement" ? "Movimiento moderado" :
             movement.pattern}
          </p>
        </div>
      )}

      {/* Speed Zones */}
      {intensity?.speed_zones && (
        <div className="border border-hairline bg-surface p-4">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-medium text-muted">
            <Zap size={13} />
            Zonas de velocidad
          </h3>
          <div className="space-y-2">
            {[
              { key: "very_high_pct", label: "Muy alta (>3 m/s)", color: "bg-red-500" },
              { key: "high_pct", label: "Alta (2-3 m/s)", color: "bg-orange-500" },
              { key: "moderate_pct", label: "Moderada (1-2 m/s)", color: "bg-amber-500" },
              { key: "low_pct", label: "Baja (<1 m/s)", color: "bg-green-500" },
            ].map(({ key, label, color }) => {
              const pct = intensity.speed_zones![key] ?? 0;
              if (pct <= 0) return null;
              return (
                <div key={key} className="flex items-center gap-2 text-xs">
                  <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
                  <span className="flex-1 text-ink">{label}</span>
                  <span className="font-mono text-muted">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary */}
      {solo.summary && (
        <div className="border border-hairline bg-surface p-4">
          <p className="text-sm text-muted">{solo.summary}</p>
        </div>
      )}
    </div>
  );
}

export function MetricsDashboard({
  players,
  events,
  fatigue,
  tactical,
  teamColors = ["#3b82f6", "#ef4444"],
  duration,
  solo,
}: MetricsDashboardProps) {
  // Solo mode: render individual activity dashboard
  if (solo?.activity_detected) {
    return <SoloStats solo={solo} />;
  }
  const team0Players = players.filter((p) => p.team === 0);
  const team1Players = players.filter((p) => p.team === 1);

  const avgSpeed = (ps: PlayerStats[]) =>
    ps.length ? (ps.reduce((s, p) => s + p.avg_speed_mps, 0) / ps.length).toFixed(1) : "0";

  const totalDistance = (ps: PlayerStats[]) =>
    ps.reduce((s, p) => s + p.total_distance_m, 0).toFixed(0);

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={<Gauge size={14} />}
          label="Vel. promedio"
          value={`${avgSpeed(team0Players)} / ${avgSpeed(team1Players)}`}
          unit="m/s"
          color0={teamColors[0]}
          color1={teamColors[1]}
        />
        <StatCard
          icon={<Footprints size={14} />}
          label="Distancia total"
          value={`${totalDistance(team0Players)} / ${totalDistance(team1Players)}`}
          unit="m"
          color0={teamColors[0]}
          color1={teamColors[1]}
        />
        <StatCard
          icon={<MapPin size={14} />}
          label="Transiciones"
          value={tactical.transitions.total.toString()}
        />
        <StatCard
          icon={<Clock size={14} />}
          label="Duración"
          value={`${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, "0")}`}
        />
      </div>

      {/* Possession */}
      <div className="border border-hairline bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-medium text-muted">
          <BarChart3 size={13} />
          Posesión
        </h3>
        <div className="relative h-6 overflow-hidden rounded-full bg-ink/10">
          <div
            className="absolute inset-y-0 left-0 rounded-l-full"
            style={{
              width: `${tactical.possession.team_0 ?? 50}%`,
              background: teamColors[0],
            }}
          />
          <div
            className="absolute inset-y-0 right-0 rounded-r-full"
            style={{
              width: `${tactical.possession.team_1 ?? 50}%`,
              background: teamColors[1],
            }}
          />
          <div className="absolute inset-0 flex items-center justify-between px-3 text-[11px] font-bold text-white">
            <span>{tactical.possession.team_0 ?? 50}%</span>
            <span>{tactical.possession.team_1 ?? 50}%</span>
          </div>
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: teamColors[0] }} />
            Equipo A · {tactical.formations.team_0?.formation ?? "—"}
          </span>
          <span className="flex items-center gap-1">
            Equipo B · {tactical.formations.team_1?.formation ?? "—"}
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: teamColors[1] }} />
          </span>
        </div>
      </div>

      {/* Player Rankings */}
      <div className="border border-hairline bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-medium text-muted">
          <Zap size={13} />
          Jugadores destacados
        </h3>
        <div className="space-y-2">
          {players
            .sort((a, b) => b.max_speed_mps - a.max_speed_mps)
            .slice(0, 5)
            .map((p) => (
              <div key={p.id} className="flex items-center gap-3 text-sm">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ background: teamColors[p.team] }}
                />
                <span className="flex-1 truncate text-ink">{p.name || `#${p.id}`}</span>
                <span className="font-mono text-xs text-muted">
                  {p.max_speed_mps.toFixed(1)} m/s max
                </span>
                <span className="font-mono text-xs text-muted">
                  {p.total_distance_m.toFixed(0)}m
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* Fatigue Alerts */}
      {fatigue.some((f) => f.fatigue_detected || f.injury_risks.length > 0) && (
        <div className="border border-amber-200 bg-amber-50 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-medium text-amber-800">
            <AlertTriangle size={13} />
            Alertas de fatiga y lesión
          </h3>
          <div className="space-y-2">
            {fatigue
              .filter((f) => f.fatigue_detected || f.injury_risks.length > 0)
              .map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <Heart size={12} className="text-amber-600" />
                  <span className="text-amber-800">
                    Jugador con score {f.fatigue_score.toFixed(0)}/100
                    {f.injury_risks.length > 0 && ` · ${f.injury_risks.length} riesgos`}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Event Timeline */}
      {events.length > 0 && (
        <div className="border border-hairline bg-surface p-4">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-medium text-muted">
            <Activity size={13} />
            Línea de tiempo ({events.length} eventos)
          </h3>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {events.map((evt, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-ink">
                <span className="w-12 font-mono text-muted">
                  {Math.floor(evt.time_s / 60)}:{String(Math.floor(evt.time_s % 60)).padStart(2, "0")}
                </span>
                <ArrowRight size={10} className="text-muted" />
                <span className="flex-1">{evt.description || formatEventType(evt.type)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  unit,
  color0,
  color1,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  color0?: string;
  color1?: string;
}) {
  return (
    <div className="border border-hairline bg-surface p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted">
        {icon}
        {label}
      </div>
      <p className="text-sm font-semibold text-ink">
        {value}
        {unit && <span className="ml-1 text-[10px] font-normal text-muted">{unit}</span>}
      </p>
      {(color0 || color1) && (
        <div className="mt-1 flex gap-1">
          {color0 && <span className="inline-block h-1.5 w-3 rounded" style={{ background: color0 }} />}
          {color1 && <span className="inline-block h-1.5 w-3 rounded" style={{ background: color1 }} />}
        </div>
      )}
    </div>
  );
}

function formatEventType(type: string): string {
  const map: Record<string, string> = {
    sprint_spike: "Sprint detectado",
    player_cluster: "Agrupación de jugadores",
    ball_out_of_frame: "Balón fuera de juego",
    ball_stopped: "Balón detenido",
    high_pressure: "Presión alta",
    possession_change: "Cambio de posesión",
  };
  return map[type] || type;
}
