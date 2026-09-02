import { chromium } from "playwright";

const BASE = "http://localhost:3000";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 2200 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message.split("\n")[0]));

try {
  const email = `hm_${Date.now()}@test.dev`;
  await page.goto(`${BASE}/registro`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/nombre/i).fill("HM");
  await page.getByLabel(/correo electr/i).fill(email);
  await page.getByLabel(/contrase/i).fill("Scout12345!");
  await page.getByRole("button", { name: /crear cuenta/i }).click();
  await page.waitForURL("**/app", { timeout: 15000 });
  const cookie = (await ctx.cookies()).find((c) => c.name === "lente_session")?.value;
  const cookieStr = `lente_session=${cookie}`;

  const demoRes = await fetch(`${BASE}/api/videos/demo`, {
    method: "POST",
    headers: { cookie: cookieStr },
  });
  const { videos } = await demoRes.json();
  console.log("demos:", videos.map((v) => `${v.sport}:${v.id}`).join(" | "));

  for (const v of videos) {
    await page.goto(`${BASE}/app/videos/${v.id}/escout`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2500);
    const heat = page.getByRole("img", { name: /Mapa de calor/i });
    const heatCount = await heat.count();
    console.log(`[${v.sport}] heat=${heatCount}`, heatCount > 0 ? `| ${await heat.first().getAttribute("aria-label")}` : "");
    if (heatCount > 0) {
      await heat.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `/tmp/heatmap-${v.sport}.png`, clip: await heat.first().boundingBox() });
      console.log(`   saved /tmp/heatmap-${v.sport}.png`);
    }
  }
} catch (e) {
  console.log("ERROR:", e.message.split("\n")[0]);
} finally {
  await browser.close();
}
