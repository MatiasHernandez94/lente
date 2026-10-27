import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function envVar(name) {
  const value =
    process.env[name] ??
    readFileSync(join(root, ".env.local"), "utf8")
      .split("\n")
      .find((line) => line.startsWith(`${name}=`))
      ?.slice(`${name}=`.length)
      .trim();
  if (!value) throw new Error(`${name} faltante`);
  return value;
}

const SUPABASE_URL = envVar("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = envVar("SUPABASE_SERVICE_ROLE_KEY");
const SESSION_SECRET = envVar("SESSION_SECRET");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const base = process.env.BASE_URL ?? "http://localhost:3000";
const origin = new URL(base).origin;

const check = (name, ok, extra = "") =>
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` -> ${extra}` : ""}`);

const email = "execution-e2e@test.local";
const userId = "execution-e2e-user";
const now = new Date().toISOString();

const { error: userError } = await supabase.from("users").upsert(
  { id: userId, name: "Usuario E2E Ejecucion", email, created_at: now },
  { onConflict: "id" },
);
if (userError) {
  console.error("upsert usuario:", userError.message);
  process.exit(2);
}

const session = await new SignJWT({ userId, expiresAt: now })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("7d")
  .sign(new TextEncoder().encode(SESSION_SECRET));
const cookie = `lente_session=${session}`;

const videoId = randomUUID();
for (const exercise of ["sentadilla", "movilidad_hombro"]) {
  const { error: videoError } = await supabase.from("videos").insert({
    id: videoId + (exercise === "sentadilla" ? "" : "-b"),
    user_id: userId,
    title: "Ejemplo — E2E ejecución de sentadilla",
    sport: "futbol",
    source_type: "youtube",
    source_ref: "https://www.youtube.com/watch?v=DD2wMzJ215g",
    duration_seconds: 30,
    players: JSON.stringify(["Atleta"]),
    status: "pending",
    created_at: now,
    updated_at: now,
  });
  if (videoError && videoError.code !== "23505") console.log("insert video:", videoError.message);
}

const vidA = videoId;
const vidB = videoId + "-b";

try {
  const snap = await fetch(`${base}/api/videos/${vidA}/execution`, { headers: { cookie } });
  const body = await snap.json();
  check("GET execution responde 200", snap.status === 200, String(snap.status));
  check("status ready (demo generado)", body.status === "ready", String(body.status));
  check("data con frames", Array.isArray(body.data?.frames) && body.data.frames.length > 0, `${body.data?.frames?.length ?? 0} frames`);
  check("exerciseId inicial sentadilla", body.exerciseId === "sentadilla", String(body.exerciseId));
  check("evaluación generada", Boolean(body.evaluation?.score?.overall), `overall=${body.evaluation?.score?.overall}`);
  check("repeticiones detectadas", (body.evaluation?.reps?.length ?? 0) >= 1, `${body.evaluation?.reps?.length ?? 0} reps`);
  check("verdict presente", Boolean(body.evaluation?.score?.verdict), String(body.evaluation?.score?.verdict));
  check("demo versionada", body.data?.meta?.demoVersion === 1, String(body.data?.meta?.demoVersion));

  const patch = await fetch(`${base}/api/videos/${vidA}/execution`, {
    method: "PATCH",
    headers: { cookie, origin, "Content-Type": "application/json" },
    body: JSON.stringify({ exerciseId: "movilidad_hombro" }),
  });
  check("PATCH a movilidad_hombro Aceptado", patch.ok, String(patch.status));

  const snap2 = await fetch(`${base}/api/videos/${vidA}/execution`, { headers: { cookie } });
  const body2 = await snap2.json();
  check("exerciseId cambió a movilidad_hombro", body2.exerciseId === "movilidad_hombro", String(body2.exerciseId));
  check("re-evaluación tras cambio", Boolean(body2.evaluation?.score?.overall), `overall=${body2.evaluation?.score?.overall}`);

  const getB = await fetch(`${base}/api/videos/${vidB}/execution`, { headers: { cookie } });
  const bodyB = await getB.json();
  check("segundo demo (otro video) ready", bodyB.status === "ready", String(bodyB.status));
  check("segundo demo con evaluación", Boolean(bodyB.evaluation?.score?.overall), `overall=${bodyB.evaluation?.score?.overall}`);
} catch (error) {
  console.error("ERROR en petición:", error.message);
}

for (const id of [vidA, vidB]) {
  await supabase.from("videos").delete().eq("id", id);
}
await supabase.from("users").delete().eq("id", userId);
console.log("E2E EXECUTION COMPLETO");
