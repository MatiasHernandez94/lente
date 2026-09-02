"use client";

import { useMemo } from "react";
import type { ScoutCalibration, ScoutTrack } from "@/lib/scout/types";
import { applyHomography } from "@/lib/scout/geom";

interface HeatMapProps {
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
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}

export function HeatMap({ track, calibration, color, playerName }: HeatMapProps) {
  const cells = useMemo(() => {
    const H = calibration.homography;
    const { width, height } = calibration.court;
    if (!width || !height) return [];
    const cols = 16;
    const rows = 10;
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
    return grid.flat();
  }, [track, calibration]);

  const maxCount = useMemo(() => Math.max(1, ...cells.map((c) => c.count)), [cells]);
  const { width, height } = calibration.court;
  const hasData = cells.some((c) => c.count > 0);

  if (!hasData) {
    return (
      <div className="border border-hairline bg-surface px-5 py-6 text-center text-sm text-muted">
        No hay posiciones suficientes para el mapa de calor de {playerName}.
      </div>
    );
  }

  const rows = 10;
  const hot = cells
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)[0];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="label text-muted">Zonas más frecuentadas</span>
        <span className="text-xs text-soft">pico {formatMeters(Math.round((hot.x + 0.5) * (width / 16)))} · {formatMeters(Math.round(((rows - hot.y - 0.5) * height) / 10))}</span>
      </div>
      <div className="border border-hairline bg-surface p-2">
        <div className="relative overflow-hidden rounded">
          <svg
            viewBox={`0 0 105 68`}
            className="h-auto w-full"
            preserveAspectRatio="none"
            aria-label={`Mapa de calor de ${playerName}`}
            role="img"
          >
            <g shapeRendering="geometricPrecision">
              <rect x={0} y={0} width={105} height={68} fill="#0f1108" />
              <g stroke="rgba(255,255,255,0.28)" strokeWidth={0.35} fill="none">
                <rect x={0} y={0} width={105} height={68} />
                <line x1={52.5} y1={0} x2={52.5} y2={68} />
                <circle cx={52.5} cy={34} r={9.15} />
                <rect x={0} y={13.85} width={16.5} height={40.3} />
                <rect x={0} y={24.84} width={5.5} height={18.32} />
                <rect x={88.5} y={13.85} width={16.5} height={40.3} />
                <rect x={99.5} y={24.84} width={5.5} height={18.32} />
                <path d="M16.5 24.85 A9.15 9.15 0 0 0 16.5 43.15" />
                <path d="M88.5 24.85 A9.15 9.15 0 0 1 88.5 43.15" />
              </g>
            </g>
            {cells.map((c) => {
              if (c.count === 0) return null;
              const alpha = 0.12 + 0.7 * (c.count / maxCount);
              const cxM = (c.x + 0.5) * (width / 16);
              const cyM = height - (c.y + 0.5) * (height / 10);
              const sx = (cxM / width) * 105;
              const sy = (cyM / height) * 68;
              const r = 2.2 + 3.2 * (c.count / maxCount);
              return (
                <circle
                  key={`${c.x}-${c.y}`}
                  cx={sx}
                  cy={sy}
                  r={r}
                  fill={color}
                  fillOpacity={alpha}
                  stroke={color}
                  strokeOpacity={Math.min(0.6, alpha + 0.2)}
                  strokeWidth={0.15}
                />
              );
            })}
          </svg>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-soft">
        Zonas con más presencia de {playerName} durante la jugada. La cancha se dibuja en proporción 105 × 68.
      </p>
    </div>
  );
}
