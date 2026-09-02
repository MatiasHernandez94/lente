"use client";

import type { ScoutAssignment, ScoutCalibration, ScoutTrack } from "@/lib/scout/types";
import { computeTrackMetrics } from "@/lib/scout/geom";
import { useMemo } from "react";

interface KpiBarsProps {
  tracks: ScoutTrack[];
  assignments: ScoutAssignment[];
  calibration: ScoutCalibration;
  fps: number;
}

interface Row {
  key: number;
  name: string;
  color: string;
  distanceM: number;
  maxSpeedKmh: number;
}

function nameFor(trackId: number, assignments: ScoutAssignment[]): string {
  return assignments.find((a) => a.trackId === trackId)?.name ?? `Jugador ${trackId + 1}`;
}

function colorFor(trackId: number, assignments: ScoutAssignment[]): string | null {
  const a = assignments.find((x) => x.trackId === trackId);
  if (!a) return null;
  return a.team === "A" ? "#4d7c0f" : "#b45309";
}

export function KpiBars({ tracks, assignments, calibration, fps }: KpiBarsProps) {
  const rows = useMemo<Row[]>(() => {
    const seen = new Map<number, Row>();
    for (const track of tracks) {
      if (seen.has(track.id)) continue;
      const m = computeTrackMetrics(track, calibration.homography, fps);
      seen.set(track.id, {
        key: track.id,
        name: nameFor(track.id, assignments),
        color: colorFor(track.id, assignments) ?? "#6b7280",
        distanceM: m.distanceM,
        maxSpeedKmh: m.maxSpeedKmh,
      });
    }
    return Array.from(seen.values()).sort((a, b) => a.key - b.key);
  }, [tracks, assignments, calibration, fps]);

  const maxDist = Math.max(1, ...rows.map((r) => r.distanceM));
  const maxSpeed = Math.max(1, ...rows.map((r) => r.maxSpeedKmh));

  if (rows.length === 0) {
    return (
      <div className="border border-hairline bg-surface px-5 py-6 text-center text-sm text-muted">
        No hay jugadores para mostrar.
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="border border-hairline bg-surface p-4">
        <p className="label mb-3 text-muted">Velocidad máxima (km/h)</p>
        <div className="flex h-40 items-end gap-3">
          {rows.map((r) => (
            <div key={`s${r.key}`} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-sm font-semibold text-ink">{r.maxSpeedKmh.toFixed(1)}</span>
              <div
                className="w-full rounded-t"
                style={{ height: `${Math.max(6, (r.maxSpeedKmh / maxSpeed) * 100)}%`, backgroundColor: r.color }}
                aria-hidden="true"
              />
              <span className="max-w-full truncate text-xs text-soft">{r.name}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="border border-hairline bg-surface p-4">
        <p className="label mb-3 text-muted">Distancia recorrida (m)</p>
        <div className="flex h-40 items-end gap-3">
          {rows.map((r) => (
            <div key={`d${r.key}`} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-sm font-semibold text-ink">{Math.round(r.distanceM)}</span>
              <div
                className="w-full rounded-t"
                style={{ height: `${Math.max(6, (r.distanceM / maxDist) * 100)}%`, backgroundColor: r.color }}
                aria-hidden="true"
              />
              <span className="max-w-full truncate text-xs text-soft">{r.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
