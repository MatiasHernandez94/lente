import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatAlert,
  isAlertsConfigured,
  resetAlertThrottle,
  sendAlert,
} from "../alerts.ts";

function withEnv(token: string | undefined, chatId: string | undefined, fn: () => Promise<void>) {
  const prevToken = process.env.TELEGRAM_BOT_TOKEN;
  const prevChatId = process.env.TELEGRAM_CHAT_ID;
  const originalFetch = globalThis.fetch;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  if (token) process.env.TELEGRAM_BOT_TOKEN = token;
  if (chatId) process.env.TELEGRAM_CHAT_ID = chatId;
  resetAlertThrottle();
  return fn()
    .catch((error) => error)
    .finally(() => {
      globalThis.fetch = originalFetch;
      delete process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_CHAT_ID;
      if (prevToken) process.env.TELEGRAM_BOT_TOKEN = prevToken;
      if (prevChatId) process.env.TELEGRAM_CHAT_ID = prevChatId;
      resetAlertThrottle();
    })
    .then((result) => {
      if (result instanceof Error) throw result;
    });
}

function fakeFetch(ok: (url: string, init: RequestInit) => boolean) {
  let calls = 0;
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = (async (input: RequestInfo, init?: RequestInit) => {
    calls++;
    const url = String(input);
    const parsed = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    requests.push({ url, body: parsed });
    return new Response(JSON.stringify({ ok: ok(url, init ?? {}) }), {
      status: ok(url, init ?? {}) ? 200 : 400,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { count: () => calls, requests };
}

test("formatAlert genera texto plano sin escapado de markdown", () => {
  const at = new Date("2026-10-07T12:00:00Z");
  const text = formatAlert(
    {
      level: "error",
      title: "Fallo final de sports",
      message: "línea con _asteriscos_ *negritas* y <tags> que rompen markdown",
      data: { jobId: "abc", errorKind: "no_keys" },
    },
    at,
  );
  assert.ok(text.includes("Lente · ERROR"), text);
  assert.ok(text.includes("Fallo final de sports"), text);
  assert.ok(text.includes("2026-10-07T12:00:00.000Z"), text);
  // Sin escapado: el texto crudo debe llegar tal cual a Telegram (parse_mode ausente).
  assert.ok(text.includes("_asteriscos_ *negritas* y <tags>"), text);
  assert.ok(text.includes("jobId: abc"), text);
  assert.ok(text.includes("errorKind: no_keys"), text);
});

test("formatAlert ignora valores nulos en data", () => {
  const text = formatAlert({
    level: "warn",
    title: "T",
    message: "M",
    data: { a: null, b: undefined, ok: 1 },
  });
  assert.ok(!text.includes("a:"), text);
  assert.ok(!text.includes("b:"), text);
  assert.ok(text.includes("ok: 1"), text);
});

test("isAlertsConfigured refleja las variables", async () => {
  await withEnv(undefined, undefined, async () => {
    assert.equal(isAlertsConfigured(), false);
  });
  await withEnv("token", "chat", async () => {
    assert.equal(isAlertsConfigured(), true);
  });
});

test("sendAlert sin configuración devuelve false sin lanzar", async () => {
  await withEnv(undefined, undefined, async () => {
    const result = await sendAlert({ level: "error", title: "T", message: "M" });
    assert.equal(result, false);
  });
});

test("sendAlert hace POST en formato JSON y no parse_mode", async () => {
  await withEnv("TOKEN", "CHAT", async () => {
    const fake = fakeFetch(() => true);
    await sendAlert({ level: "error", title: "Título", message: "Mensaje" });
    assert.equal(fake.count(), 1);
    const [request] = fake.requests;
    assert.ok(request.url.endsWith("/botTOKEN/sendMessage"), request.url);
    assert.equal(request.body.chat_id, "CHAT");
    assert.equal(typeof request.body.text, "string");
    assert.equal("parse_mode" in request.body, false, "no debe mandar parse_mode");
  });
});

test("sendAlert respeta el throttle por título", async () => {
  await withEnv("TOKEN", "CHAT", async () => {
    const fake = fakeFetch(() => true);
    await sendAlert({ level: "error", title: "Mismo", message: "1" });
    await sendAlert({ level: "error", title: "Mismo", message: "2" });
    await sendAlert({ level: "warn", title: "Mismo", message: "3" });
    assert.equal(fake.count(), 2, "solo la primera de cada nivel pasa el throttle");
  });
});

test("sendAlert vuelve a intentar si Telegram rechaza (quita el throttle)", async () => {
  await withEnv("TOKEN", "CHAT", async () => {
    const fake = fakeFetch(() => false);
    await sendAlert({ level: "error", title: "Rechazada", message: "1" });
    await sendAlert({ level: "error", title: "Rechazada", message: "2" });
    assert.equal(fake.count(), 2, "un rechazo no debe dejar el throttle puesto");
  });
});