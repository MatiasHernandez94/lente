import { test } from "node:test";
import assert from "node:assert/strict";
import { isRetryableError, MAX_JOB_ATTEMPTS, retryDelayMs } from "../retry.ts";

test("retryDelayMs crece exponencialmente", () => {
  assert.equal(retryDelayMs(1), 30_000);
  assert.equal(retryDelayMs(2), 60_000);
  assert.equal(retryDelayMs(3), 120_000);
  assert.equal(retryDelayMs(0), 30_000);
});

test("isRetryableError considera transitorios los fallos sin kind o recuperables", () => {
  assert.equal(isRetryableError("quota"), true);
  assert.equal(isRetryableError("internal"), true);
  assert.equal(isRetryableError(undefined), true);
  assert.equal(isRetryableError(null), true);
});

test("isRetryableError no reintenta fallos permanentes", () => {
  assert.equal(isRetryableError("video_unavailable"), false);
  assert.equal(isRetryableError("unknown_job_kind"), false);
  assert.equal(isRetryableError("no_sport_detected"), false);
  // Payload determinista o claves faltantes: reintentar solo consume intentos
  // y retrasa la alerta real.
  assert.equal(isRetryableError("invalid_payload"), false);
  assert.equal(isRetryableError("no_keys"), false);
});

test("MAX_JOB_ATTEMPTS es 3", () => {
  assert.equal(MAX_JOB_ATTEMPTS, 3);
});