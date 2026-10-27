import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://anwyrljeukwvqwiegqxb.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SESSION_SECRET = process.env.SESSION_SECRET ?? "";
const SESSION_COOKIE = "lente_session";

const client = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function createTestUser() {
  const id = randomUUID();
  const email = `e2e-${Date.now()}@test.local`;
  const { error } = await client.from("users").insert({
    id,
    name: "E2E Tester",
    email,
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(`insert user: ${error.message}`);

  const session = await new SignJWT({ userId: id, expiresAt: new Date(Date.now() + 60_000).toISOString() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SESSION_SECRET));
  return { id, session };
}

let pass = 0;
let fail = 0;
function record(ok, msg) {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${msg}`);
}

async function main() {
  if (!SERVICE_KEY || !SESSION_SECRET) throw new Error("Faltan env vars de Supabase/SESSION_SECRET");

  const { id: userId, session } = await createTestUser();
  const headers = { cookie: `${SESSION_COOKIE}=${session}`, "content-type": "application/json" };
  const ori = { origin: BASE };
  void userId;

  const authed = await fetch(`${BASE}/api/videos`, {
    method: "POST",
    headers: { ...headers, ...ori },
    body: JSON.stringify({
      title: "Video E2E",
      sport: "baloncesto",
      sourceType: "youtube",
      sourceRef: "https://www.youtube.com/watch?v=uJs693eNfuQ",
      durationSeconds: 4800,
      players: ["Base", "Pívot"],
    }),
  });
  const created = await authed.json();
  record(authed.status === 201 && !!created.video, `crear video (${authed.status}, id=${created.video?.id})`);
  const videoId = created.video?.id ?? "";

  const anon = await fetch(`${BASE}/api/videos`, {
    method: "POST",
    headers: { "content-type": "application/json", ...ori },
    body: JSON.stringify({ title: "x", sport: "futbol", sourceType: "upload", durationSeconds: 1, players: [] }),
  });
  record(anon.status === 401 || anon.status === 403, `sin sesión -> ${anon.status}`);

  const list = await fetch(`${BASE}/api/videos`, { headers: { cookie: headers.cookie } });
  const listJson = await list.json();
  record(list.status === 200 && listJson.videos.some((v) => v.id === videoId), "listar videos incluye el nuevo");

  if (videoId) {
    const analyze = await fetch(`${BASE}/api/videos/${videoId}/analizar`, {
      method: "POST",
      headers: { ...headers, ...ori },
    });
    const anaJson = await analyze.json();
    record(analyze.status === 200 && !!anaJson.video, `analizar video (${analyze.status})`);

    const ev = await fetch(`${BASE}/api/videos/${videoId}/events`, {
      method: "POST",
      headers: { ...headers, ...ori },
      body: JSON.stringify({ team: "A", player: "Base", eventType: "made", x: 5, y: 2, t: 10, points: 2 }),
    });
    const evJson = await ev.json();
    record(ev.status === 201 && !!evJson.event, `crear evento (${ev.status})`);

    const evList = await fetch(`${BASE}/api/videos/${videoId}/events`, { headers: { cookie: headers.cookie } });
    const evListJson = await evList.json();
    record(evList.status === 200 && Array.isArray(evListJson.events), `listar eventos (${evList.status})`);

    const scout = await fetch(`${BASE}/api/videos/${videoId}/scout`, { headers: { cookie: headers.cookie } });
    record(scout.status === 200, `consultar scout (${scout.status})`);
  }

  console.log(`\nResultado: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
