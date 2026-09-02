import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const SAMPLE = "/Users/mati/Documents/Default Project/lente/data/uploads/14ca874f-5b51-4b88-85e7-f8394ba1fd22.mp4";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 2200 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message.split("\n")[0]));

try {
  const email = `sc_${Date.now()}@test.dev`;
  await page.goto(`${BASE}/registro`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/nombre/i).fill("Sc");
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
  const videoRes = await apiFetch("/api/videos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Chart", sport: "padel", sourceType: "upload", sourceRef: fileName, durationSeconds: 120, players: ["J1"] }) });
  const videoId = videoRes.video.id;
  await apiFetch(`/api/videos/${videoId}/scout`, { method: "POST", headers: { "content-type": "application/json" } });
  let status = "";
  for (let i = 0; i < 60; i++) { await page.waitForTimeout(5000); const st = await apiFetch(`/api/videos/${videoId}/scout`); status = st.status; if (status === "ready" || status === "error") break; }
  await apiFetch(`/api/videos/${videoId}/scout/calibrate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ points: [{x:0.05,y:0.75},{x:0.95,y:0.75},{x:0.95,y:0.25},{x:0.05,y:0.25}], court: { width: 20, height: 10 } }) });
  await apiFetch(`/api/videos/${videoId}/scout/select`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trackId: 0, name: "Jugador de prueba", team: "A" }) });
  await page.goto(`${BASE}/app/videos/${videoId}/escout`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);
  const chart = page.getByRole("img", { name: /Gráfica de velocidad/i });
  await chart.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "/tmp/speedchart.png", fullPage: false });
  console.log("screenshot guardado /tmp/speedchart.png");
} catch (e) {
  console.log("ERROR:", e.message.split("\n")[0]);
} finally {
  await browser.close();
}
