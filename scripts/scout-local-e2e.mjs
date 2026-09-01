import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const SAMPLE = "/Users/mati/Documents/Default Project/lente/data/uploads/14ca874f-5b51-4b88-85e7-f8394ba1fd22.mp4";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

page.on("pageerror", (e) => console.log("[pageerror]", e.message.split("\n")[0]));

try {
  const email = `scout_${Date.now()}@test.dev`;
  await page.goto(`${BASE}/registro`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/nombre/i).fill("Scout Test");
  await page.getByLabel(/correo electr/i).fill(email);
  await page.getByLabel(/contrase/i).fill("Scout12345!");
  await page.getByRole("button", { name: /crear cuenta/i }).click();
  await page.waitForURL("**/app", { timeout: 15000 });
  console.log("✓ usuario", email, "->", page.url());

  const cookies = await ctx.cookies();
  const sessionCookie = cookies.find((c) => c.name === "lente_session");
  if (!sessionCookie) throw new Error("no session cookie");
  const cookieStr = `lente_session=${sessionCookie.value}`;
  console.log("✓ cookie de sesión obtenida");

  async function api(path, opts = {}, withAuth = true) {
    const headers = { ...(opts.headers || {}) };
    if (withAuth) headers.cookie = cookieStr;
    const res = await fetch(`${BASE}${path}`, { ...opts, headers });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body };
  }

  const up = await api("/api/upload", { method: "POST" }, false);
  console.log("upload sin auth ->", up.status, "(esperado 401)");

  const form = new FormData();
  const file = await import("node:fs/promises").then((fs) => fs.readFile(SAMPLE));
  form.append("file", new File([file], "muestra.mp4", { type: "video/mp4" }));
  const up2 = await fetch(`${BASE}/api/upload`, { method: "POST", headers: { cookie: cookieStr }, body: form });
  const upBody = await up2.json();
  if (!up2.ok || !upBody.file) throw new Error("upload falló: " + JSON.stringify(upBody));
  console.log("✓ upload ->", upBody.file, up2.status);

  const created = await api("/api/videos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Prueba scout local",
      sport: "futbol",
      sourceType: "upload",
      sourceRef: upBody.file,
      durationSeconds: 120,
      players: ["S1", "S2"],
    }),
  });
  if (created.status !== 201) throw new Error("crear video: " + JSON.stringify(created.body));
  const videoId = created.body.video.id;
  console.log("✓ video creado", videoId);

  const start = await api(`/api/videos/${videoId}/scout`, { method: "POST" });
  console.log("scout POST ->", start.status, JSON.stringify(start.body));

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await api(`/api/videos/${videoId}/scout`);
    const status = st.body?.status;
    console.log(`  poll ${i + 1}: status=${status}`);
    if (status === "ready" || status === "error") {
      console.log(JSON.stringify({ final: status, err: st.body?.error_message ?? null, tracks: st.body?.data?.tracks?.length }));
      break;
    }
  }
} catch (e) {
  console.log("ERROR:", e.message.split("\n")[0]);
} finally {
  await browser.close();
}