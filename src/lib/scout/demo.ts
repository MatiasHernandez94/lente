import "server-only";
import { saveScoutCalibration, saveScoutResult } from "@/lib/repo";
import type { ScoutResultData, ScoutTrack, ScoutPoint } from "./types";
import { TEAM_COLORS } from "./colors";
import { makeCalibration } from "./geom";

const FPS = 5;
const DEMO_DURATION_SEC = 96;
const PLAYER_W = 0.05;
const PLAYER_H = 0.09;

export const DEMO_VERSION = 2;

const COURT_DIMS: Record<string, { width: number; height: number }> = {
  futbol: { width: 105, height: 68 },
  baloncesto: { width: 28, height: 15 },
  padel: { width: 20, height: 10 },
  voleibol: { width: 18, height: 9 },
  default: { width: 28, height: 15 },
};

interface Anchor {
  x: number;
  y: number;
  radius: number;
}

const MARGIN = 1.5;

function randomInCircle(cx: number, cy: number, r: number): { x: number; y: number } {
  const ang = Math.random() * Math.PI * 2;
  const rad = Math.sqrt(Math.random()) * r;
  return { x: cx + rad * Math.cos(ang), y: cy + rad * Math.sin(ang) };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Define una zona de preferencia realista por deporte y rol del jugador.
 * El jugador 0 (el que se selecciona primero en la UI) recibe la zona
 * más icónica del deporte para que el mapa de calor se vea reconocible.
 */
function pickAnchor(sport: string, index: number, courtW: number, courtH: number): Anchor {
  const cx = courtW / 2;
  const cy = courtH / 2;

  switch (sport) {
    case "baloncesto": {
      const side = index % 2 === 0 ? 1 : -1;
      const rimX = cx + side * courtW * 0.38; // aro cercano
      const roles: Anchor[] = [
        { x: rimX, y: cy, radius: 3.6 },
        { x: cx, y: cy, radius: 3.0 },
        { x: rimX - side * 2.0, y: cy + 3.4, radius: 2.6 },
        { x: rimX + side * 2.5, y: cy - 3.2, radius: 2.4 },
        { x: rimX, y: cy - side * 4.0, radius: 2.8 },
      ];
      return roles[index % roles.length];
    }
    case "futbol": {
      const roles: Anchor[] = [
        { x: courtW * 0.75, y: cy, radius: 17 },
        { x: courtW * 0.15, y: cy, radius: 15 },
        { x: cx, y: cy, radius: 14 },
        { x: courtW * 0.9, y: 20, radius: 14 },
        { x: courtW * 0.1, y: 48, radius: 14 },
        { x: courtW * 0.55, y: cy, radius: 16 },
      ];
      return roles[index % roles.length];
    }
    case "padel": {
      const netX = courtW / 2;
      const roles: Anchor[] = [
        { x: netX + (index % 2 === 0 ? 0.4 : -0.4), y: courtH * 0.28, radius: 1.9 },
        { x: netX + (index % 2 === 0 ? -0.5 : 0.5), y: courtH * 0.78, radius: 2.2 },
        { x: netX, y: courtH * 0.5, radius: 2.0 },
      ];
      return roles[index % roles.length];
    }
    case "voleibol": {
      const netY = courtH * 0.33;
      const roles: Anchor[] = [
        { x: cx, y: netY, radius: 1.5 },
        { x: courtW * 0.28, y: netY, radius: 1.3 },
        { x: courtW * 0.72, y: netY, radius: 1.3 },
        { x: cx, y: courtH * 0.78, radius: 1.4 },
        { x: courtW * 0.3, y: courtH * 0.78, radius: 1.3 },
      ];
      return roles[index % roles.length];
    }
    default: {
      return { x: cx, y: cy, radius: courtW * 0.25 };
    }
  }
}

/**
 * Genera una trayectoria "zonificada": el jugador deambula dentro de su zona
 * de preferencia (densidad alta en el centro, de ahí el hotspot del mapa de
 * calor) y de vez en cuando hace una incursión fuera de la zona antes de volver.
 */
function zonedTrajectory(anchor: Anchor, courtW: number, courtH: number): ScoutPoint[] {
  const pts: ScoutPoint[] = [];
  const pos = randomInCircle(anchor.x, anchor.y, anchor.radius * 0.3);
  let roamTarget = randomInCircle(anchor.x, anchor.y, anchor.radius);

  for (let i = 0; i <= DEMO_DURATION_SEC * FPS; i++) {
    const t = i / FPS;

    // De vez en cuando, una incursión puntual fuera de la zona.
    const excursion = i % Math.floor(FPS * 12) === 0;
    let baseX = anchor.x;
    let baseY = anchor.y;
    let r = anchor.radius;
    if (excursion) {
      baseX = courtW * (0.2 + Math.random() * 0.6);
      baseY = courtH * (0.2 + Math.random() * 0.6);
      r = Math.max(2, courtW * 0.12);
    }

    if (dist(pos, roamTarget) < 1.2 || excursion) {
      roamTarget = randomInCircle(baseX, baseY, r);
    }

    const dirX = roamTarget.x - pos.x;
    const dirY = roamTarget.y - pos.y;
    const d = Math.hypot(dirX, dirY) || 1;
    const unitX = dirX / d;
    const unitY = dirY / d;

    // Más lento cerca del centro de la zona => mayor densidad (zona caliente).
    const fromCenter = dist(pos, { x: anchor.x, y: anchor.y }) / anchor.radius;
    const speed = clamp(0.9 + fromCenter * 3.2, 0.5, 4.2);

    pos.x = clamp(pos.x + unitX * speed * (1 / FPS), MARGIN, courtW - MARGIN);
    pos.y = clamp(pos.y + unitY * speed * (1 / FPS), MARGIN, courtH - MARGIN);

    pts.push({
      t,
      x: pos.x / courtW,
      y: pos.y / courtH,
      w: PLAYER_W,
      h: PLAYER_H,
    });
  }

  return pts;
}

export function buildDemoScoutData(sport: string, playerCount: number): ScoutResultData {
  const { width, height } = COURT_DIMS[sport] ?? COURT_DIMS.default;
  const count = Math.max(1, Math.min(playerCount || 6, 14));
  const tracks: ScoutTrack[] = [];

  for (let i = 0; i < count; i++) {
    const team: "A" | "B" = i % 2 === 0 ? "A" : "B";
    const anchor = pickAnchor(sport, i, width, height);
    const points = zonedTrajectory(anchor, width, height);
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
    meta: { demoVersion: DEMO_VERSION },
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

function teamColorHex(team: "A" | "B"): [number, number, number] {
  const raw = TEAM_COLORS[team].stroke.replace("#", "");
  return [
    parseInt(raw.slice(0, 2), 16),
    parseInt(raw.slice(2, 4), 16),
    parseInt(raw.slice(4, 6), 16),
  ];
}
