import { chromium } from "playwright";

const BASE = "http://localhost:3000";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failed = [];
  const requests = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("requestfailed", (req) => failed.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText}`));
  page.on("request", (req) => requests.push(`${req.method()} ${req.url()}`));

  console.log(">> Navegando a /registro");
  await page.goto(`${BASE}/registro`, { waitUntil: "networkidle" });
  console.log("URL:", page.url());

  await page.fill('input[name="name"]', "Prueba Registro");
  await page.fill('input[name="email"]', `reg-${Date.now()}@test.local`);
  await page.fill('input[name="password"]', "Secret123");
  console.log(">> Haciendo click en Crear cuenta");
  await page.click('button[type="submit"]');

  await page.waitForTimeout(5000);
  console.log("URL despues de submit:", page.url());
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 200));
  console.log("Body visible (primeros 200):", JSON.stringify(bodyText));

  console.log("\n=== REQUESTS ===");
  console.log(requests.join("\n").slice(0, 3000));
  console.log("\n=== FAILED REQUESTS ===");
  console.log(failed.length ? failed.join("\n") : "(ninguno)");
  console.log("\n=== CONSOLE ERRORS ===");
  console.log(consoleErrors.length ? consoleErrors.join("\n---\n") : "(ninguno)");
  console.log("\n=== PAGE ERRORS ===");
  console.log(pageErrors.length ? pageErrors.join("\n---\n") : "(ninguno)");

  await browser.close();
}

main().catch((e) => {
  console.error("SCRIPT ERROR:", e);
  process.exit(1);
});
