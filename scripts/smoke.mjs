import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
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
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS videos (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title            TEXT NOT NULL,
    sport            TEXT NOT NULL,
    source_type      TEXT NOT NULL,
    source_ref       TEXT,
    duration_seconds INTEGER,
    status           TEXT NOT NULL DEFAULT 'pending',
    error_message    TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_videos_user_created ON videos(user_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS analyses (
    video_id     TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
    score        INTEGER NOT NULL,
    result       TEXT NOT NULL,
    generated_at TEXT NOT NULL
  );
`);

const secret = readFileSync(join(root, ".env.local"), "utf8")
  .split("\n")
  .find((line) => line.startsWith("SESSION_SECRET="))
  ?.slice("SESSION_SECRET=".length)
  .trim();
if (!secret) throw new Error("SESSION_SECRET faltante");

const email = "smoke@test.local";
sqlite
  .prepare(
    `INSERT INTO users (id, name, email, password_hash, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET name = excluded.name`,
  )
  .run("smoke-user", "Usuario Prueba", email, bcrypt.hashSync("Prueba1234", 10), new Date().toISOString());

const user = sqlite.prepare(`SELECT id FROM users WHERE email = ?`).get(email);

const session = await new SignJWT({ userId: user.id, expiresAt: new Date().toISOString() })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("7d")
  .sign(new TextEncoder().encode(secret));

const base = process.env.BASE_URL ?? "http://localhost:3000";
const origin = new URL(base).origin;
const cookie = `lente_session=${session}`;

const check = (name, response, ok = true) => console.log(`${ok ? "PASS" : "FAIL"} ${name} -> ${response.status}`);

let response = await fetch(`${base}/`);
check("landing publica", response, response.ok && (await response.text()).includes("LENTE"));

response = await fetch(`${base}/api/videos`, { headers: { cookie } });
const videosBody = await response.json();
check("GET /api/videos autenticado", response);
const initialCount = videosBody.videos?.length ?? 0;

response = await fetch(`${base}/api/videos`);
check("GET /api/videos sin sesion", response, response.status === 401);

// +1 video de humo y +4 demos respecto del listado inicial
const DEMO_COUNT = 4;

const created = await fetch(`${base}/api/videos`, {
  method: "POST",
  headers: { cookie, "Content-Type": "application/json", origin },
  body: JSON.stringify({
    title: "Smoke — Fútbol amistoso",
    sport: "futbol",
    sourceType: "youtube",
    sourceRef: "https://youtu.be/dQw4w9WgXcQ",
    durationSeconds: 5400,
  }),
});
const createdBody = await created.json();
check("POST /api/videos", created, created.status === 201);
const videoId = createdBody.video?.id;
if (!videoId) throw new Error("Sin id de video");

response = await fetch(`${base}/api/videos/${videoId}/analizar`, {
  method: "POST",
  headers: { cookie, origin },
});
const analyzed = await response.json();
check("POST analizar", response, response.ok && analyzed.video?.status === "ready" && Boolean(analyzed.analysis));

response = await fetch(`${base}/api/videos/${videoId}`, { headers: { cookie } });
const detail = await response.json();
check("GET detalle analysis", response, Boolean(detail.analysis?.result?.okrs?.length));

const demo = await fetch(`${base}/api/videos/demo`, { method: "POST", headers: { cookie, origin } });
check("POST demo", demo, demo.status === 201);

response = await fetch(`${base}/api/videos`, { headers: { cookie } });
const finalListing = await response.json();
check(
  "listado crecio en 1 + 4 (humo + demos)",
  response,
  (finalListing.videos?.length ?? 0) === initialCount + 1 + DEMO_COUNT,
);

response = await fetch(`${base}/app`, { headers: { cookie } });
check("GET /app autenticado", response, response.ok && (await response.text()).includes("Resumen"));

response = await fetch(`${base}/app`, { redirect: "manual" });
check("GET /app sin sesion redirige", response, response.status === 307 || response.status === 308);

console.log("okr sample:", JSON.stringify(detail.analysis.result.okrs[0]?.objective ?? "sin okrs"));
console.log("summary sample:", detail.analysis.result.summary.slice(0, 90));
sqlite.close();