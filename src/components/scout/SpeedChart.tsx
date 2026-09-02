"use client";

import { useMemo } from "react";
import type { ScoutCalibration, ScoutTrack } from "@/lib/scout/types";
import { instantSpeedAt } from "@/lib/scout/geom";

const SPRINT_THRESHOLD_KMH = 18;
const W = 320;
const H = 110;
const PAD_LEFT = 4;
const PAD_RIGHT = 4;
const PAD_TOP = 6;
const PAD_BOTTOM = 20;
const MAX_SPEED_DEFAULT = 34;

interface SpeedChartProps {
  track: ScoutTrack;
  calibration: ScoutCalibration | null;
  currentTime: number;
  color: string;
  playerName: string;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins > 0 ? `${mins}:${String(secs).padStart(2, "0")}` : `0:${String(secs).padStart(2, "0")}`;
}

export function SpeedChart({ track, calibration, currentTime, color, playerName }: SpeedChartProps) {
  const { samples, maxSpeed, tMin, tMax } = useMemo(() => {
    const pts = track.points;
    if (pts.length < 2 || !calibration) {
      return { samples: [] as { t: number; v: number }[], maxSpeed: 0, tMin: 0, tMax: 0 };
    }
    const t0 = pts[0].t;
    const t1 = pts[pts.length - 1].t;
    const H = calibration.homography;
    const bucket: { t: number; v: number }[] = [];
    let maxV = 0;
    const step = (t1 - t0) / 200;
    for (let t = t0; t <= t1; t += Math.max(step, 1e-3)) {
      const v = instantSpeedAt(track, H, t);
      if (v !== null) {
        bucket.push({ t, v });
        maxV = Math.max(maxV, v);
      }
    }
    return { samples: bucket, maxSpeed: maxV, tMin: t0, tMax: t1 };
  }, [track, calibration]);

  if (samples.length < 2 || !calibration) {
    return (
      <div className="border border-hairline bg-surface px-5 py-6 text-center text-sm text-muted">
        No hay datos suficientes para graficar la velocidad de {playerName}.
      </div>
    );
  }

  const yMax = Math.max(MAX_SPEED_DEFAULT, maxSpeed * 1.1);
  const plotW = W - PAD_LEFT - PAD_RIGHT;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const x = (t: number) => PAD_LEFT + ((t - tMin) / (tMax - tMin || 1)) * plotW;
  const y = (v: number) => PAD_TOP + (1 - v / yMax) * plotH;

  const linePath = samples.map((s, i) => `${i === 0 ? "M" : "L"}${x(s.t).toFixed(1)},${y(s.v).toFixed(1)}`).join(" ");
  const sprintPaths: string[] = [];
  let running = false;
  let seg: number[] = [];
  const flush = () => {
    if (seg.length > 1) sprintPaths.push(seg.map((i, k) => `${k === 0 ? "M" : "L"}${x(samples[i].t).toFixed(1)},${y(samples[i].v).toFixed(1)}`).join(" "));
    seg = [];
    running = false;
  };
  samples.forEach((s, i) => {
    if (s.v >= SPRINT_THRESHOLD_KMH) {
      if (!running) { running = true; seg = [i]; }
      else seg.push(i);
    } else if (running) {
      flush();
    }
  });
  if (running) flush();

  const cursor = currentTime >= tMin && currentTime <= tMax;
  const cursorX = x(Math.min(Math.max(currentTime, tMin), tMax));
  const cursorV = instantSpeedAt(track, calibration.homography, currentTime);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="label text-muted">Velocidad en el tiempo</span>
        {cursor && cursorV !== null ? (
          <span className="text-sm font-semibold" style={{ color }}>
            {cursorV.toFixed(1)} km/h
          </span>
        ) : null}
      </div>
      <div className="border border-hairline bg-surface p-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Gráfica de velocidad de ${playerName} a lo largo del tiempo`}
          style={{ maxWidth: W + 24 }}
        >
          <line x1={PAD_LEFT} y1={H - PAD_BOTTOM} x2={W - PAD_RIGHT} y2={H - PAD_BOTTOM} stroke="currentColor" strokeOpacity={0.2} />
          <polyline points={linePath} fill="none" stroke="currentColor" strokeOpacity={0.35} strokeWidth={1} />
          {sprintPaths.map((d, i) => (
            <path key={i} d={d} fill="none" stroke={color} strokeWidth={2} />
          ))}
          {cursor ? <line x1={cursorX} y1={PAD_TOP} x2={cursorX} y2={H - PAD_BOTTOM} stroke="currentColor" strokeWidth={1} strokeDasharray="3 3" /> : null}
          {cursor ? <circle cx={cursorX} cy={y(cursorV ?? 0)} r={3.5} fill={color} /> : null}
          <text x={PAD_LEFT + 2} y={H - 6} fontSize={9} fill="currentColor" fillOpacity={0.6}>{formatTime(tMin)}</text>
          <text x={W - PAD_RIGHT - 2} y={H - 6} fontSize={9} fill="currentColor" fillOpacity={0.6} textAnchor="end">{formatTime(tMax)}</text>
        </svg>
      </div>
      <p className="mt-1.5 text-xs text-soft">
        Línea resaltada: sprints (&ge; {SPRINT_THRESHOLD_KMH} km/h). Usa la línea de tiempo del video para mover el marcador.
      </p>
    </div>
  );
}
