/** QA explícito: crea únicamente cuentas y un objeto temporales y luego los elimina. */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

if (process.env.LENTE_QA_MEDIA !== "1") throw new Error("Ejecutar solo con LENTE_QA_MEDIA=1.");
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z_][A-Z_0-9]*)=(.*)$/);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const base = process.env.LENTE_QA_URL ?? "http://localhost:3010";
if (!supabaseUrl || !anonKey || !serviceKey || !process.env.DATABASE_URL) throw Error("Falta configuración QA.");
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const ids = [];
let objectPath;
let videoId;
let failed = false;

async function account() {
  const email = `qa-${randomUUID()}@example.com`;
  const password = `A1${randomUUID()}!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? Error("No se pudo crear cuenta QA");
  ids.push(created.data.user.id);
  const jar = new Map();
  const client = createServerClient(supabaseUrl, anonKey, { cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
  } });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  const request = (path, options = {}) => fetch(base + path, {
    ...options,
    headers: { Cookie: cookie, Origin: base, ...(options.headers ?? {}) },
    redirect: "manual",
  });
  if ((await request("/api/videos")).status !== 200) throw Error("No se pudo iniciar sesión QA");
  return { id: created.data.user.id, request };
}

function expect(condition, message) { if (!condition) throw Error(message); console.log(`OK: ${message}`); }
const post = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

try {
  await db.connect();
  const owner = await account();
  const stranger = await account();
  const teacher = await account();
  await db.query("update public.users set rol=$1 where id=$2", ["profesor", teacher.id]);
  await db.query("insert into public.profesor_alumno (profesor_id,alumno_id,created_at) values ($1,$2,$3)", [teacher.id, owner.id, new Date().toISOString()]);

  const signed = await owner.request("/api/upload/sign", post({ fileName: "qa.mp4", size: 8 }));
  expect(signed.status === 200, "dueño puede solicitar subida firmada");
  const upload = await signed.json();
  objectPath = upload.path;
  const storage = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } }).storage.from("videos");
  const uploaded = await storage.uploadToSignedUrl(upload.path, upload.token, new Blob(["qa video"], { type: "video/mp4" }), { contentType: "video/mp4" });
  if (uploaded.error) throw uploaded.error;
  const data = { title: "QA temporal", sport: "general", sourceType: "upload", sourceRef: upload.file, uploadReceipt: upload.receipt, durationSeconds: 120, players: [] };
  const creation = await owner.request("/api/videos", post(data));
  expect(creation.status === 201, "dueño registra su archivo con comprobante");
  videoId = (await creation.json()).video.id;
  expect((await owner.request(`/api/media/${upload.file}`)).status === 307, "dueño accede a su archivo");
  expect((await teacher.request(`/api/media/${upload.file}`)).status === 307, "profesor vinculado accede al archivo del alumno");
  expect((await stranger.request(`/api/media/${upload.file}`)).status === 404, "otra cuenta no accede al archivo");
  expect((await fetch(`${base}/api/media/${upload.file}`, { redirect: "manual" })).status === 401, "sin sesión no se accede");
  expect((await stranger.request("/api/videos", post({ ...data, uploadReceipt: undefined }))).status === 403, "otra cuenta no registra el archivo ajeno sin comprobante");
  expect((await stranger.request("/api/videos", post(data))).status === 403, "otra cuenta no puede reutilizar el comprobante ajeno");
  await db.query("delete from public.profesor_alumno where profesor_id=$1 and alumno_id=$2", [teacher.id, owner.id]);
  expect((await teacher.request(`/api/media/${upload.file}`)).status === 404, "profesor desvinculado pierde acceso");
} catch (error) {
  failed = true;
  console.error("QA falló:", error instanceof Error ? error.message : String(error));
} finally {
  if (objectPath) {
    const removed = await admin.storage.from("videos").remove([objectPath]);
    if (removed.error) { failed = true; console.error("No se pudo borrar el objeto QA:", removed.error.message); }
  }
  if (videoId) await db.query("delete from public.videos where id=$1 and user_id=$2", [videoId, ids[0]]).catch((e) => { failed = true; console.error("No se pudo borrar video QA:", e.message); });
  for (const id of ids) {
    await db.query("delete from public.users where id=$1", [id]).catch((e) => { failed = true; console.error("No se pudo borrar perfil QA:", e.message); });
    const result = await admin.auth.admin.deleteUser(id);
    if (result.error) { failed = true; console.error("No se pudo borrar cuenta QA:", result.error.message); }
  }
  await db.end();
  if (failed) process.exitCode = 1;
}
