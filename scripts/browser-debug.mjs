import { chromium } from "playwright";

const BASE = "http://localhost:3000";

const browser = await chromium.launch({ channel: "chrome", headless: false, slowMo: 50 });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

page.on("console", (msg) => {
  const t = msg.type();
  if (t === "error" || t === "warning") {
    console.log(`[console:${t}] ${new Date().toISOString()}`, msg.text().slice(0, 800));
  }
});
page.on("pageerror", (err) => {
  console.log(`[pageerror] ${new Date().toISOString()}`, err.stack ? err.stack.split("\n").slice(0, 4).join(" | ") : err.message);
});
page.on("requestfailed", (req) => {
  console.log(`[reqfailed] ${new Date().toISOString()}`, req.url().slice(0, 150), "->", req.failure()?.errorText);
});
page.on("response", (res) => {
  if (res.status() >= 400) console.log(`[HTTP ${res.status()}]`, res.url().slice(0, 150));
});

console.log(`[open] ${new Date().toISOString()} abriendo ${BASE}/registro`);
await page.goto(`${BASE}/registro`, { waitUntil: "domcontentloaded" });
console.log("[open] listo. interactua en la ventana abierta. Cierrala cuando termines.");

page.on("close", () => {
  console.log("[done] ventana cerrada");
  browser.close();
  process.exit(0);
});

setTimeout(() => {
  console.log("[timeout] 10 min agotados, cerrando");
  browser.close();
  process.exit(0);
}, 10 * 60 * 1000);