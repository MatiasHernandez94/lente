"use client";

import { useMemo } from "react";
import type { ScoutCalibration, ScoutTrack } from "@/lib/scout/types";
import type { Sport } from "@/lib/analysis/types";
import { applyHomography } from "@/lib/scout/geom";
import { SportCourtSvg } from "./sportCourt";

interface HeatMapProps {
  sport: Sport;
  track: ScoutTrack;
  calibration: ScoutCalibration;
  color: string;
  playerName: string;
}

interface Cell {
  x: number;
  y: number;
  count: number;
}

function formatMeters(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} m`;
  return `${Math.round(m)} m`;
}

function heatColor(t: number): string {
  const stops: Array<[number, [number, number, number]]> = [
    [0, [22, 34, 56]],
    [0.35, [30, 96, 130]],
    [0.65, [255, 150, 40]],
    [1, [230, 40, 30]],
  ];
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      a = stops[i];
      b = stops[i + 1];
      break;
    }
  }
  const span = b[0] - a[0] || 1;
  const k = (t - a[0]) / span;
  const r = Math.round(a[1][0] + (b[1][0] - a[1][0]) * k);
  const g = Math.round(a[1][1] + (b[1][1] - a[1][1]) * k);
  const bl = Math.round(a[1][2] + (b[1][2] - a[1][2]) * k);
  return `rgb(${r},${g},${bl})`;
}

export function HeatMap({ sport, track, calibration, color, playerName }: HeatMapProps) {
  const { courtWidth, courtHeight, cols, rows, cellW, cellH, cells, maxCount } = useMemo(() => {
    const H = calibration.homography;
    const { width, height } = calibration.court;
    if (!width || !height) {
      return { courtWidth: 0, courtHeight: 0, cols: 0, rows: 0, cellW: 0, cellH: 0, cells: [] as Cell[], maxCount: 1 };
    }
    const cols = 20;
    const rows = 12;
    const grid: Cell[][] = Array.from({ length: rows }, (_, y) =>
      Array.from({ length: cols }, (_, x) => ({ x, y, count: 0 })),
    );
    for (const p of track.points) {
      const world = applyHomography(H, p.x, p.y);
      if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) continue;
      const wx = Math.min(width, Math.max(0, world.x));
      const wy = Math.min(height, Math.max(0, world.y));
      const cx = Math.min(cols - 1, Math.floor((wx / width) * cols));
      const cy = Math.min(rows - 1, Math.floor((wy / height) * rows));
      grid[cy][cx].count += 1;
    }
    const flat = grid.flat();
    const maxCount = Math.max(1, ...flat.map((c) => c.count));
    return { courtWidth: width, courtHeight: height, cols, rows, cellW: width / cols, cellH: height / rows, cells: flat, maxCount };
  }, [track, calibration]);

  const hasData = cells.some((c) => c.count > 0);

  if (!hasData || !courtWidth || !courtHeight) {
    return (
      <div className="border border-hairline bg-surface px-5 py-6 text-center text-sm text-muted">
        No hay posiciones suficientes para el mapa de calor de {playerName}.
      </div>
    );
  }

  const hot = cells.filter((c) => c.count > 0).sort((a, b) => b.count - a.count)[0];
  const hotX = (hot.x + 0.5) * cellW;
  const hotY = courtHeight - (hot.y + 0.5) * cellH;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="label text-muted">Zonas más frecuentadas</span>
        <span className="flex items-center gap-1.5 text-xs text-soft">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          {formatMeters(hotX)} · {formatMeters(hotY)}
        </span>
      </div>
      <div className="border border-hairline bg-surface p-2">
        <div className="relative overflow-hidden rounded">
          <svg
            viewBox={`0 0 ${courtWidth} ${courtHeight}`}
            className="h-auto w-full"
            preserveAspectRatio="none"
            aria-label={`Mapa de calor de ${playerName}`}
            role="img"
          >
            <defs>
              <filter id="heat-blur" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation={Math.max(0.35, courtWidth / 60)} />
              </filter>
            </defs>

            <rect x={0} y={0} width={courtWidth} height={courtHeight} fill="#0c0f08" />

            <g filter="url(#heat-blur)">
              <rect x={0} y={0} width={courtWidth} height={courtHeight} fill="#141c30" opacity={0.9} />
              {cells.map((c) => {
                if (c.count === 0) return null;
                const t = c.count / maxCount;
                const x = c.x * cellW;
                const y = courtHeight - (c.y + 1) * cellH;
                const pad = (1 - t * 0.55) * cellW * 0.04;
                return (
                  <rect
                    key={`${c.x}-${c.y}`}
                    x={x + pad}
                    y={y + pad}
                    width={cellW - pad * 2}
                    height={cellH - pad * 2}
                    fill={heatColor(t)}
                    fillOpacity={0.15 + 0.85 * t}
                  />
                );
              })}
            </g>

            <g className="text-white/70" style={{ color: "rgba(255,255,255,0.72)" }}>
              <SportCourtSvg sport={sport} width={courtWidth} height={courtHeight} />
            </g>
          </svg>
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-soft">
        <span>Zonas con más presencia de {playerName}. Más intenso = más tiempo.</span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-[#142238]" />
          baja
          <span className="h-2 w-2 rounded-sm bg-[#ff9628]" />
          media
          <span className="h-2 w-2 rounded-sm bg-[#e6281e]" />
          alta
        </span>
      </div>
    </div>
  );
}
