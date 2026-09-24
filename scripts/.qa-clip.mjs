import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const uid = Date.now();
const profId = `prof-c-${uid}`;
const alumnoId = `alu-c-${uid}`;
const videoId = `video-c-${uid}`;
const videouuid = crypto.randomUUID();
const ext = ".mp4";

try {
  // Usuarios profesor + alumno
  await admin.from("users").insert({ id: profId, name: "Profe Clip", email: `prof-c-${uid}@test.dev`, rol: "profesor", terms_accepted: true, created_at: new Date().toISOString() });
  await admin.from("users").insert({ id: alumnoId, name: "Alumna Clip", email: `alu-c-${uid}@test.dev`, rol: "alumno", terms_accepted: true, created_at: new Date().toISOString() });
  // Vínculo profesor->alumno
  await admin.from("profesor_alumno").insert({ profesor_id: profId, alumno_id: alumnoId, created_at: new Date().toISOString() });

  // Video del alumno apuntando al archivo local
  await admin.from("videos").insert({
    id: videouuid,
    user_id: alumnoId,
    title: "QA clip test",
    sport: "futbol",
    source_type: "upload",
    source_ref: "qa-clip-test.mp4",
    duration_seconds: 30,
    players: [],
    status: "ready",
    created_at: new Date().toISOString(),
  });

  // Corrección en min 0 con fin en min 0 (primeros segundos)
  await admin.from("correcciones").insert({
    id: `corr-c-${uid}`,
    video_id: videouuid,
    profesor_id: profId,
    alumno_id: alumnoId,
    mensaje: "QA clip: mira entre 0 y 0",
    minuto_inicio: 0,
    minuto_fin: 0,
    created_at: new Date().toISOString(),
  });

  // Leer corrección para confirmar
  const corr = await admin.from("correcciones").select("id, video_id, minuto_inicio, clip_url").eq("video_id", videouuid).single();
  console.log("corrección:", corr.data?.id, "| min", corr.data?.minuto_inicio, "| clip:", corr.data?.clip_url);
} catch (e) {
  console.error("ERROR SETUP:", e.message);
} finally {
  console.log("SETUP_DONE");
  console.log(JSON.stringify({ profId, alumnoId, videoId: videouuid, correccionId: `corr-c-${uid}`, email: `prof-c-${uid}@test.dev` }));
  // cleanup parcial al final del script completo
}
