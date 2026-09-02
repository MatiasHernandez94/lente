import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const SAMPLE = "/Users/mati/Documents/Default Project/lente/data/uploads/14ca874f-5b51-4b88-85e7-f8394ba1fd22.mp4";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message.split("\n")[0]));

try {
  const email = `scout_${Date.now()}@test.dev`;
  await page.goto(`${BASE}/registro`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/nombre/i).fill("Scout UI Test");
  await page.getByLabel(/correo electr/i).fill(email);
  await page.getByLabel(/contrase/i).fill("Scout12345!");
  await page.getByRole("button", { name: /crear cuenta/i }).click();
  await page.waitForURL("**/app", { timeout: 15000 });
  console.log("✓ usuario", email);

  const cookie = (await ctx.cookies()).find((c) => c.name === "lente_session")?.value;
  const cookieStr = `lente_session=${cookie}`;

  async function apiFetch(path, init = {}) {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { cookie: cookieStr, ...init.headers },
    });
    return res.json();
  }

  const form = new FormData();
  const file = await import("node:fs/promises").then((fs) => fs.readFile(SAMPLE));
  form.append("file", new File([file], "muestra.mp4", { type: "video/mp4" }));
  const uploadRes = await fetch(`${BASE}/api/upload`, { method: "POST", headers: { cookie: cookieStr }, body: form });
  const { file: fileName } = await uploadRes.json();
  console.log("✓ upload", fileName);

  const videoRes = await apiFetch("/api/videos", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieStr },
    body: JSON.stringify({ title: "UI scout test", sport: "futbol", sourceType: "upload", sourceRef: fileName, durationSeconds: 120, players: ["J1", "J2"] }),
  });
  const videoId = videoRes.video.id;
  console.log("✓ video", videoId);

  await apiFetch(`/api/videos/${videoId}/scout`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieStr },
  });
  console.log("✓ scout started");

  let status = "";
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(5000);
    const st = await apiFetch(`/api/videos/${videoId}/scout`);
    status = st.status;
    process.stdout.write(`  poll ${i + 1}: ${status}\n`);
    if (status === "ready" || status === "error") break;
  }
  if (status !== "ready") throw new Error("scout status: " + status);

  await apiFetch(`/api/videos/${videoId}/scout/calibrate`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieStr },
    body: JSON.stringify({
      points: [
        { x: 0.05, y: 0.75 },
        { x: 0.95, y: 0.75 },
        { x: 0.95, y: 0.25 },
        { x: 0.05, y: 0.25 },
      ],
      court: { width: 28.65, height: 15.24 },
    }),
  });
  console.log("✓ calibración guardada");

  await apiFetch(`/api/videos/${videoId}/scout/select`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieStr },
    body: JSON.stringify({ trackId: 0, name: "Jugador de prueba", team: "A" }),
  });
  console.log("✓ jugador asignado");

  await page.goto(`${BASE}/app/videos/${videoId}/escout`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log("✓ scout page opened");

  const chart = page.getByRole("img", { name: /Gráfica de velocidad/i });
  const found = await chart.count();
  console.log(`✓ SpeedChart encontrado: ${found > 0 ? "SÍ" : "NO"} (count=${found})`);

  if (found > 0) {
    const labelText = await chart.getAttribute("aria-label");
    console.log(`  aria-label: ${labelText}`);
    const box = await chart.boundingBox();
    console.log(`  bounding box:`, JSON.stringify(box));
  }

  const metricsCard = page.locator("text=Distancia").first();
  console.log("✓ métricas visibles:", (await metricsCard.count()) > 0);

} catch (e) {
  console.log("ERROR:", e.message.split("\n")[0]);
} finally {
  await browser.close();
}
