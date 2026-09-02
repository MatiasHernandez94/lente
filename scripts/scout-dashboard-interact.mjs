import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const SAMPLE = "/Users/mati/Documents/Default Project/lente/data/uploads/14ca874f-5b51-4b88-85e7-f8394ba1fd22.mp4";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 2400 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message.split("\n")[0]));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

try {
  const email = `kd_${Date.now()}@test.dev`;
  await page.goto(`${BASE}/registro`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/nombre/i).fill("KP");
  await page.getByLabel(/correo electr/i).fill(email);
  await page.getByLabel(/contrase/i).fill("Scout12345!");
  await page.getByRole("button", { name: /crear cuenta/i }).click();
  await page.waitForURL("**/app", { timeout: 15000 });
  const cookie = (await ctx.cookies()).find((c) => c.name === "lente_session")?.value;
  const cookieStr = `lente_session=${cookie}`;
  async function apiFetch(path, init = {}) {
    const res = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: cookieStr, ...init.headers } });
    return res.json();
  }
  const form = new FormData();
  const file = await import("node:fs/promises").then((fs) => fs.readFile(SAMPLE));
  form.append("file", new File([file], "muestra.mp4", { type: "video/mp4" }));
  const uploadRes = await fetch(`${BASE}/api/upload`, { method: "POST", headers: { cookie: cookieStr }, body: form });
  const { file: fileName } = await uploadRes.json();
  const videoRes = await apiFetch("/api/videos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "KPI", sport: "padel", sourceType: "upload", sourceRef: fileName, durationSeconds: 120, players: ["J1"] }) });
  const videoId = videoRes.video.id;
  await apiFetch(`/api/videos/${videoId}/scout`, { method: "POST", headers: { "content-type": "application/json" } });
  let status = "";
  for (let i = 0; i < 60; i++) { await page.waitForTimeout(5000); const st = await apiFetch(`/api/videos/${videoId}/scout`); status = st.status; if (status === "ready" || status === "error") break; }
  if (status !== "ready") throw new Error("scout: " + status);
  await apiFetch(`/api/videos/${videoId}/scout/calibrate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ points: [{x:0.05,y:0.75},{x:0.95,y:0.75},{x:0.95,y:0.25},{x:0.05,y:0.25}], court: { width: 20, height: 10 } }) });
  await page.goto(`${BASE}/app/videos/${videoId}/escout`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  const select = page.getByLabel("Seleccionar jugador");
  const optionCount = await select.locator("option").count();
  console.log("opciones del selector:", optionCount);
  if (optionCount < 2) throw new Error("se esperaban 2+ opciones (placeholders + jugadores)");

  // Cambiar al segundo jugador y verificar que cambia la sección
  const before = await page.getByRole("heading", { name: /Análisis de/i }).first().textContent();
  await select.selectOption({ index: 1 });
  await page.waitForTimeout(800);
  const after = await page.getByRole("heading", { name: /Análisis de/i }).first().textContent();
  console.log("sección antes:", before?.trim(), "| después:", after?.trim());

  const totalTracks = await page.getByText(/jugador(es)? detectado/i).first().textContent();
  console.log("total detectados:", totalTracks?.trim());

  // Desplazarse y capturar
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(600);
  await page.screenshot({ path: "/tmp/kpi-dashboard-full.png", fullPage: true });
  console.log("screenshot /tmp/kpi-dashboard-full.png");

  console.log("errores pagina/consola:", errors.length === 0 ? "ninguno" : errors);
} catch (e) {
  console.log("ERROR:", e.message.split("\n")[0]);
} finally {
  await browser.close();
}
