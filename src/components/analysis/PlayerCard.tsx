import { Activity, Gauge, Zap, Flag } from "lucide-react";
import type { PlayerAnalysis } from "@/lib/analysis/types";
import { Heatmap } from "./Heatmap";
import { MetricBar } from "./MetricBar";

export function PlayerCard({ player, index }: { player: PlayerAnalysis; index: number }) {
  const { movement } = player;

  return (
    <article className="border border-hairline bg-canvas">
      <header className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="label text-muted">{String(index + 1).padStart(2, "0")}</span>
          <h3 className="text-[15px] font-medium text-ink">{player.name}</h3>
        </div>
        <span className="label text-muted">{player.position}</span>
      </header>

      <div className="grid grid-cols-2 gap-px border-b border-hairline bg-hairline sm:grid-cols-4">
        <div className="bg-canvas px-5 py-4">
          <Activity size={15} strokeWidth={1.8} className="mb-2 text-muted" aria-hidden="true" />
          <span className="block text-[11px] tracking-wide text-soft">Distancia</span>
          <span className="table-num mt-0.5 block text-lg font-semibold text-ink">
            {movement.distanceKm.toFixed(1)}
            <span className="ml-0.5 text-xs font-normal text-muted">km</span>
          </span>
        </div>
        <div className="bg-canvas px-5 py-4">
          <Gauge size={15} strokeWidth={1.8} className="mb-2 text-muted" aria-hidden="true" />
          <span className="block text-[11px] tracking-wide text-soft">Velocidad media</span>
          <span className="table-num mt-0.5 block text-lg font-semibold text-ink">
            {movement.avgSpeedKmh.toFixed(1)}
            <span className="ml-0.5 text-xs font-normal text-muted">km/h</span>
          </span>
        </div>
        <div className="bg-canvas px-5 py-4">
          <Zap size={15} strokeWidth={1.8} className="mb-2 text-muted" aria-hidden="true" />
          <span className="block text-[11px] tracking-wide text-soft">Velocidad máxima</span>
          <span className="table-num mt-0.5 block text-lg font-semibold text-ink">
            {movement.maxSpeedKmh.toFixed(1)}
            <span className="ml-0.5 text-xs font-normal text-muted">km/h</span>
          </span>
        </div>
        <div className="bg-canvas px-5 py-4">
          <Flag size={15} strokeWidth={1.8} className="mb-2 text-muted" aria-hidden="true" />
          <span className="block text-[11px] tracking-wide text-soft">Sprints</span>
          <span className="table-num mt-0.5 block text-lg font-semibold text-ink">
            {movement.sprints}
            <span className="ml-0.5 text-xs font-normal text-muted"></span>
          </span>
        </div>
      </div>

      <div className="space-y-6 px-5 py-5">
        <div>
          <span className="label mb-2 block text-muted">Zonas de juego ocupadas</span>
          <Heatmap zones={player.heatmap} />
        </div>

        <div>
          <span className="label mb-1 block text-muted">Indicadores propios</span>
          <div className="border-b border-hairline">
            {player.kpis.map((metric) => (
              <MetricBar key={metric.key} metric={metric} />
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}