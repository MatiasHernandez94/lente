import { chromium } from "playwright";

const BASE = "http://localhost:3000";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

try {
  const email = `yt_${Date.now()}@test.dev`;
  await page.goto(`${BASE}/registro`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/nombre/i).fill("YT Test");
  await page.getByLabel(/correo electr/i).fill(email);
  await page.getByLabel(/contrase/i).fill("Scout12345!");
  await page.getByRole("button", { name: /crear cuenta/i }).click();
  await page.waitForURL("**/app", { timeout: 15000 });
  console.log("✓ usuario", email);

  const cookie = (await ctx.cookies()).find((c) => c.name === "lente_session")?.value;
  const headers = { cookie: `lente_session=${cookie}` };

  async function api(path, opts = {}) {
    const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body };
  }

  const demo = await api("/api/videos/demo", { method: "POST" });
  if (demo.status !== 201) throw new Error("demo: " + JSON.stringify(demo.body));
  const vids = demo.body.videos;
  console.log("✓ demos creados:", vids.map((v) => `${v.id.slice(0, 8)} ${v.sourceRef}`).join("\n"));
  const target = vids[0];

  const start = await api(`/api/videos/${target.id}/scout`, { method: "POST" });
  console.log("scout POST ->", start.status, JSON.stringify(start.body));

  for (let i = 0; i < 36; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await api(`/api/videos/${target.id}/scout`);
    const status = st.body?.status;
    console.log(`  poll ${i + 1}: status=${status}${status === "error" ? " msg=" + st.body?.error_message : ""}`);
    if (status === "ready" || status === "error") break;
  }
} catch (e) {
  console.log("ERROR:", e.message.split("\n")[0]);
} finally {
  await browser.close();
}