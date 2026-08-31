import { createRequire } from "node:module";
import { readFileSync, copyFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATABASE_PATH = join(root, "data", "lente.db");
const Database = require("better-sqlite3");
const { SignJWT } = require("jose");
const bcrypt = require("bcryptjs");

const sqlite = new Database(DATABASE_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.exec(
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
     password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS videos (
     id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     title TEXT NOT NULL, sport TEXT NOT NULL, source_type TEXT NOT NULL, source_ref TEXT,
     duration_seconds INTEGER, players TEXT NOT NULL DEFAULT '[]',
     status TEXT NOT NULL DEFAULT 'pending', error_message TEXT,
     created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS scout_analyses (
     video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
     status TEXT NOT NULL DEFAULT 'none', fps INTEGER, width INTEGER, height INTEGER,
     duration_seconds INTEGER, tracks_json TEXT, teams_json TEXT, players_json TEXT NOT NULL DEFAULT '[]',
     calibration_json TEXT, error_message TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS idx_videos_user_created ON videos(user_id, created_at DESC);
   CREATE TABLE IF NOT EXISTS video_events (
     id TEXT PRIMARY KEY, video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
     team TEXT NOT NULL, player TEXT NOT NULL DEFAULT '', event_type TEXT NOT NULL,
     x REAL NOT NULL, y REAL NOT NULL, t REAL NOT NULL, points INTEGER, created_at TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS idx_video_events_video ON video_events(video_id, t);`,
);

const secret = readFileSync(join(root, ".env.local"), "utf8")
  .split("\n")
  .find((line) => line.startsWith("SESSION_SECRET="))
  ?.slice("SESSION_SECRET=".length)
  .trim();
if (!secret) throw new Error("SESSION_SECRET faltante");

const email = "scout-e2e@test.local";
sqlite
  .prepare(
    `INSERT INTO users (id, name, email, password_hash, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET name = excluded.name`,
  )
  .run("scout-user", "Usuario Scout", email, bcrypt.hashSync("Prueba1234", 10), new Date().toISOString());
const user = sqlite.prepare(`SELECT id FROM users WHERE email = ?`).get(email);

const session = await new SignJWT({ userId: user.id, expiresAt: new Date().toISOString() })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("7d")
  .sign(new TextEncoder().encode(secret));

const base = process.env.BASE_URL ?? "http://localhost:3000";
const origin = new URL(base).origin;
const cookie = `lente_session=${session}`;

const check = (name, ok, extra = "") =>
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` -> ${extra}` : ""}`);

const videoId = randomUUID();
const filename = `${randomUUID()}.mp4`;
copyFileSync(join(root, "data", "samples", "basket_top_14s.mp4"), join(root, "data", "uploads", filename));
const now = new Date().toISOString();
sqlite
  .prepare(
    `INSERT INTO videos (id, user_id, title, sport, source_type, source_ref, duration_seconds, players, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  .run(videoId, user.id, "Scout E2E — Basquet cancha cenital", "baloncesto", "camera", filename, 14, "[]", "ready", now, now);
check("video local insertado en DB", true);

const start = await fetch(`${base}/api/videos/${videoId}/scout`, {
  method: "POST",
  headers: { cookie, origin },
});
const startBody = await start.json();
check("POST scout inicia análisis", start.ok && startBody.status === "running", start.status);

let status = "running";
const deadline = Date.now() + 180000;
let snapshot = null;
while (status === "running" && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 4000));
  const res = await fetch(`${base}/api/videos/${videoId}/scout`, { headers: { cookie } });
  snapshot = await res.json();
  status = snapshot.status;
  console.log(`  polling: status=${status}`);
}
check("scout llega a ready", status === "ready", status);
if (!snapshot?.data) throw new Error("Sin datos de seguimiento");

const trackCount = snapshot.data.tracks.length;
check("se generan trayectorias", trackCount > 0, `${trackCount} tracks`);
const ordered = [...snapshot.data.tracks].sort((a, b) => b.points.length - a.points.length);
const bestTrack = ordered[0];
check("track principal tiene puntos", bestTrack.points.length > 2, `${bestTrack.points.length} puntos`);
console.log(`track ${bestTrack.id} (${bestTrack.points.length} pts) color=${JSON.stringify(bestTrack.color)} team=${bestTrack.team}`);

const calibrate = await fetch(`${base}/api/videos/${videoId}/scout/calibrate`, {
  method: "POST",
  headers: { cookie, origin, "Content-Type": "application/json" },
  body: JSON.stringify({
    points: [
      { x: 0.02, y: 0.3 },
      { x: 0.98, y: 0.3 },
      { x: 0.98, y: 0.96 },
      { x: 0.02, y: 0.96 },
    ],
    court: { width: 28.65, height: 15.24 },
  }),
});
const calibrateBody = await calibrate.json();
check("POST calibrate acepta 4 puntos", calibrate.ok && Boolean(calibrateBody.calibration?.homography), calibrate.status);

const select = await fetch(`${base}/api/videos/${videoId}/scout/select`, {
  method: "POST",
  headers: { cookie, origin, "Content-Type": "application/json" },
  body: JSON.stringify({ trackId: bestTrack.id, name: "Álex", team: "A" }),
});
const selectBody = await select.json();
check(
  "POST select asigna jugador",
  select.ok && selectBody.assignment?.name === "Álex" && selectBody.assignment?.team === "A",
  select.status,
);

const final = await fetch(`${base}/api/videos/${videoId}/scout`, { headers: { cookie } });
const finalBody = await final.json();
check("GET scout devuelve 1 jugador", finalBody.assignments?.length === 1);
check("métricas de jugador generadas", (finalBody.metrics?.length ?? 0) === 1);
const metric = finalBody.metrics?.[0];
if (metric) {
  console.log(
    `métricas ${metric.name} (${metric.team}): ${metric.distanceM}m, ${metric.avgSpeedKmh}km/h media, ${metric.maxSpeedKmh}km/h máx, ${metric.sprints} sprints, ${metric.playTimeS}s`,
  );
}
check("distancia y velocidad no negativas", !metric || (metric.distanceM >= 0 && metric.maxSpeedKmh >= 0));

const evPost = await fetch(`${base}/api/videos/${videoId}/events`, {
  method: "POST",
  headers: { cookie, origin, "Content-Type": "application/json" },
  body: JSON.stringify({ team: "A", player: "Álex", eventType: "made", x: 6.5, y: 7.6, t: 5.2, points: 2 }),
});
check("POST evento (tiro convertido)", evPost.status === 201, evPost.status);

const evGet = await fetch(`${base}/api/videos/${videoId}/events`, { headers: { cookie } });
const evBody = await evGet.json();
check("GET eventos muestra la jugada", evBody.events?.length === 1 && evBody.events[0].eventType === "made");

const evBad = await fetch(`${base}/api/videos/${videoId}/events`, {
  method: "POST",
  headers: { cookie, origin, "Content-Type": "application/json" },
  body: JSON.stringify({ team: "A", eventType: "made", x: -5, y: 7.6, t: 5.2 }),
});
check("POST evento fuera de cancha rechazado", evBad.status === 400, evBad.status);

const evBadType = await fetch(`${base}/api/videos/${videoId}/events`, {
  method: "POST",
  headers: { cookie, origin, "Content-Type": "application/json" },
  body: JSON.stringify({ team: "A", eventType: "made", x: 5, y: 5, t: 5.2, points: 4 }),
});
check("POST evento con puntos inválidos rechazado", evBadType.status === 400, evBadType.status);

const eventId = evBody.events[0].id;
const evDel = await fetch(`${base}/api/videos/${videoId}/events/${eventId}`, {
  method: "DELETE",
  headers: { cookie, origin },
});
check("DELETE evento", evDel.status === 200, evDel.status);

const evEmpty = await fetch(`${base}/api/videos/${videoId}/events`, { headers: { cookie } });
check("lista vacía tras eliminar", (await evEmpty.json()).events?.length === 0);

sqlite.close();
console.log("E2E SCOUT COMPLETO");