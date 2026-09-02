import "server-only";
import { saveScoutCalibration, saveScoutResult } from "@/lib/repo";
import type { ScoutResultData, ScoutTrack, ScoutPoint } from "./types";
import { TEAM_COLORS } from "./colors";
import { makeCalibration } from "./geom";

const FPS = 5;
const DEMO_DURATION_SEC = 96;
const PLAYER_W = 0.05;
const PLAYER_H = 0.09;

const COURT_DIMS: Record<string, { width: number; height: number }> = {
  futbol: { width: 105, height: 68 },
  baloncesto: { width: 28, height: 15 },
  padel: { width: 20, height: 10 },
  voleibol: { width: 18, height: 9 },
  default: { width: 28, height: 15 },
};

interface TrajectorySegment {
  t0: number;
  t1: number;
  speedMps: number;
  angleRad: number;
}

const TWO_PI = Math.PI * 2;

function buildTrajectory(x0m: number, y0m: number, courtW: number, courtH: number): TrajectorySegment[] {
  const segs: TrajectorySegment[] = [];
  let t = 0;
  const margin = 1.5;
  const xMin = margin;
  const xMax = courtW - margin;
  const yMin = margin;
  const yMax = courtH - margin;
  let x = Math.min(Math.max(x0m, xMin), xMax);
  let y = Math.min(Math.max(y0m, yMin), yMax);
  let angle = Math.random() * TWO_PI;

  while (t < DEMO_DURATION_SEC) {
    const remaining = DEMO_DURATION_SEC - t;
    const walkRoll = Math.random();
    let speed: number;
    let segLen: number;
    if (walkRoll < 0.45) {
      speed = 1.4 + Math.random() * 0.6;
      segLen = Math.min(remaining, 4 + Math.random() * 3);
    } else if (walkRoll < 0.78) {
      speed = 2.4 + Math.random() * 1.1;
      segLen = Math.min(remaining, 3 + Math.random() * 2.5);
    } else {
      speed = 5.2 + Math.random() * 1.4;
      segLen = Math.min(remaining, 1.8 + Math.random() * 1.2);
    }
    const t1 = t + segLen;
    segs.push({ t0: t, t1, speedMps: speed, angleRad: angle });

    const step = speed * segLen;
    x += step * Math.cos(angle);
    y += step * Math.sin(angle);
    if (x < xMin || x > xMax || y < yMin || y > yMax) {
      angle = Math.atan2(-Math.sin(angle), -Math.cos(angle));
      x = Math.min(Math.max(x, xMin), xMax);
      y = Math.min(Math.max(y, yMin), yMax);
    } else {
      angle += (Math.random() - 0.5) * 0.9;
    }
    t += segLen;
  }
  return segs;
}

function sampleTrajectory(
  segs: TrajectorySegment[],
  x0m: number,
  y0m: number,
  courtW: number,
  courtH: number,
): ScoutPoint[] {
  const pts: ScoutPoint[] = [];
  const margin = 1.5;
  let x = Math.min(Math.max(x0m, margin), courtW - margin);
  let y = Math.min(Math.max(y0m, margin), courtH - margin);

  for (let i = 0; i <= DEMO_DURATION_SEC * FPS; i++) {
    const t = i / FPS;
    const seg = findSegment(segs, t);
    if (!seg) break;
    x = Math.min(Math.max(x + seg.speedMps * Math.cos(seg.angleRad) * (1 / FPS), margin), courtW - margin);
    y = Math.min(Math.max(y + seg.speedMps * Math.sin(seg.angleRad) * (1 / FPS), margin), courtH - margin);
    pts.push({
      t,
      x: x / courtW,
      y: y / courtH,
      w: PLAYER_W,
      h: PLAYER_H,
    });
  }
  return pts;
}

function findSegment(segs: TrajectorySegment[], t: number): TrajectorySegment | null {
  for (const seg of segs) {
    if (t >= seg.t0 && t < seg.t1) return seg;
  }
  return segs[segs.length - 1] ?? null;
}

function teamColorHex(team: "A" | "B"): [number, number, number] {
  const raw = TEAM_COLORS[team].stroke.replace("#", "");
  return [
    parseInt(raw.slice(0, 2), 16),
    parseInt(raw.slice(2, 4), 16),
    parseInt(raw.slice(4, 6), 16),
  ];
}

export function buildDemoScoutData(sport: string, playerCount: number): ScoutResultData {
  const { width, height } = COURT_DIMS[sport] ?? COURT_DIMS.default;
  const count = Math.max(1, Math.min(playerCount || 6, 14));
  const tracks: ScoutTrack[] = [];

  for (let i = 0; i < count; i++) {
    const team: "A" | "B" = i % 2 === 0 ? "A" : "B";
    const x0m = (i % 6) / 6 * width;
    const y0m = ((i % 4) / 4) * height;
    const segs = buildTrajectory(x0m, y0m, width, height);
    const points = sampleTrajectory(segs, x0m, y0m, width, height);
    if (points.length === 0) continue;
    tracks.push({
      id: i,
      born: points[0].t,
      color: teamColorHex(team),
      team,
      points,
    });
  }

  return {
    video: { width: 1280, height: 720, durationSec: DEMO_DURATION_SEC },
    analysis: { fps: FPS, frames: DEMO_DURATION_SEC * FPS },
    tracks,
    teams: { A: teamColorHex("A"), B: teamColorHex("B") },
  };
}

export async function generateDemoScout(
  videoId: string,
  sport: string,
  playerCount: number,
): Promise<void> {
  const { width, height } = COURT_DIMS[sport] ?? COURT_DIMS.default;
  const data = buildDemoScoutData(sport, playerCount);
  await saveScoutResult(videoId, data);
  await saveScoutCalibration(videoId, makeCalibration(
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    { width, height },
  ));
}
