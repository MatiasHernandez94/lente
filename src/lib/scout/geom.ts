import type { ScoutCalibration, ScoutPoint, ScoutTrack, ScoutPlayerMetrics } from "./types";

export type ImagePoint = { x: number; y: number };

export function computeHomography(src: ImagePoint[], dst: ImagePoint[]): number[][] {
  if (src.length !== 4 || dst.length !== 4) {
    throw new Error("La homografía requiere 4 puntos de origen y destino.");
  }

  const rows: number[][] = [];
  const rhs: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = src[i];
    const { x: X, y: Y } = dst[i];
    rows.push([u, v, 1, 0, 0, 0, -X * u, -X * v]);
    rhs.push(X);
    rows.push([0, 0, 0, u, v, 1, -Y * u, -Y * v]);
    rhs.push(Y);
  }
  const solution = solveLinear(rows, rhs);
  return [
    [solution[0], solution[1], solution[2]],
    [solution[3], solution[4], solution[5]],
    [solution[6], solution[7], 1],
  ];
}

export function applyHomography(H: number[][], x: number, y: number): ImagePoint {
  const w = H[2][0] * x + H[2][1] * y + H[2][2];
  return {
    x: (H[0][0] * x + H[0][1] * y + H[0][2]) / w,
    y: (H[1][0] * x + H[1][1] * y + H[1][2]) / w,
  };
}

function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    }
    if (Math.abs(m[piv][col]) < 1e-12) {
      throw new Error("No se pudo resolver la homografía: puntos colineales.");
    }
    [m[col], m[piv]] = [m[piv], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col] / m[col][col];
      for (let c = 0; c <= n; c++) {
        m[r][c] -= factor * m[col][c];
      }
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

export function makeCalibration(
  points: ImagePoint[],
  court: { width: number; height: number },
): ScoutCalibration {
  const dst: ImagePoint[] = [
    { x: 0, y: 0 },
    { x: court.width, y: 0 },
    { x: court.width, y: court.height },
    { x: 0, y: court.height },
  ];
  return {
    points,
    court,
    homography: computeHomography(points, dst),
  };
}

const SPRINT_THRESHOLD_KMH = 18;
const SPRINT_MIN_SECONDS = 0.5;

export interface TrackMetrics {
  distanceM: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  sprints: number;
  playTimeS: number;
}

export function computeTrackMetrics(track: ScoutTrack, H: number[][], fps: number): TrackMetrics {
  const pts: { t: number; x: number; y: number }[] = [];
  for (const p of track.points) {
    const world = applyHomography(H, p.x, p.y);
    if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) continue;
    pts.push({ t: p.t, x: world.x, y: world.y });
  }
  if (pts.length < 2) {
    return { distanceM: 0, avgSpeedKmh: 0, maxSpeedKmh: 0, sprints: 0, playTimeS: 0 };
  }

  const step = 1 / fps;
  let distance = 0;
  let movingTime = 0;
  let maxSpeed = 0;
  const speeds: { t: number; v: number }[] = [];

  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i].t - pts[i - 1].t;
    if (dt <= 0 || dt > step * 2 + 0.01) continue;
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const d = Math.hypot(dx, dy);
    const vMs = d / dt;
    const vKmh = vMs * 3.6;
    distance += d;
    speeds.push({ t: pts[i].t, v: vKmh });
    if (vKmh > maxSpeed) maxSpeed = vKmh;
    if (vKmh > 0.5) movingTime += dt;
  }

  let sprints = 0;
  let running = false;
  let runStart = 0;
  for (const { t, v } of speeds) {
    if (v >= SPRINT_THRESHOLD_KMH && !running) {
      running = true;
      runStart = t;
    } else if (v < SPRINT_THRESHOLD_KMH && running) {
      if (t - runStart >= SPRINT_MIN_SECONDS) sprints++;
      running = false;
    }
  }
  if (running && pts[pts.length - 1].t - runStart >= SPRINT_MIN_SECONDS) sprints++;

  const playTime = pts[pts.length - 1].t - pts[0].t;
  const avgSpeed = movingTime > 0 ? (distance / movingTime) * 3.6 : 0;

  return {
    distanceM: Math.round(distance * 100) / 100,
    avgSpeedKmh: Math.round(avgSpeed * 10) / 10,
    maxSpeedKmh: Math.round(maxSpeed * 10) / 10,
    sprints,
    playTimeS: Math.round(playTime * 10) / 10,
  };
}

export function computePlayerMetrics(
  track: ScoutTrack,
  name: string,
  team: "A" | "B",
  calibration: ScoutCalibration,
  fps: number,
): ScoutPlayerMetrics {
  const metrics = computeTrackMetrics(track, calibration.homography, fps);
  return {
    trackId: track.id,
    name,
    team,
    color: track.color ?? null,
    ...metrics,
  };
}

export function interpolateTrackPoint(track: ScoutTrack, t: number): ScoutPoint | null {
  const pts = track.points;
  if (pts.length === 0) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (t < first.t || t > last.t) return null;
  let prev = first;
  for (let i = 1; i < pts.length; i++) {
    const next = pts[i];
    if (next.t >= t) {
      const span = next.t - prev.t;
      const alpha = span > 0 ? (t - prev.t) / span : 0;
      return {
        t,
        x: prev.x + alpha * (next.x - prev.x),
        y: prev.y + alpha * (next.y - prev.y),
        w: prev.w + alpha * (next.w - prev.w),
        h: prev.h + alpha * (next.h - prev.h),
      };
    }
    prev = next;
  }
  return last;
}

export function scoutPointAt(track: ScoutTrack, t: number): { x: number; y: number; w: number; h: number } | null {
  const p = interpolateTrackPoint(track, t);
  return p ? { x: p.x, y: p.y, w: p.w, h: p.h } : null;
}

const INSTANT_WINDOW_SECONDS = 1;

export function instantSpeedAt(track: ScoutTrack, H: number[][], t: number): number | null {
  const p = interpolateTrackPoint(track, t);
  if (!p) return null;
  const q = interpolateTrackPoint(track, t - INSTANT_WINDOW_SECONDS);
  if (!q) return 0;
  const a = applyHomography(H, p.x, p.y);
  const b = applyHomography(H, q.x, q.y);
  if (!Number.isFinite(a.x) || !Number.isFinite(b.x)) return 0;
  const distM = Math.hypot(a.x - b.x, a.y - b.y);
  return (distM / INSTANT_WINDOW_SECONDS) * 3.6;
}