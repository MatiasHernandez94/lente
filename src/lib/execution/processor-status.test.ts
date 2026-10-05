import { test } from "node:test";
import assert from "node:assert/strict";
import {
  jobErrorMessage,
  resolveJobViewStatus,
  staleMinutesForKind,
  STALE_MINUTES_BY_KIND,
} from "../processor-status.ts";

test("staleMinutesForKind da margen amplio a los análisis deportivos", () => {
  // Regresión: un job de sports sano puede tardar >40 min; con 30 min se
  // revivaba mientras seguía corriendo -> dos análisis en paralelo.
  assert.ok(
    staleMinutesForKind("sports") > 40,
    "el umbral de sports debe superar los 40 min observados en videos largos",
  );
});

test("staleMinutesForKind deja margen amplio también para improve y detección", () => {
  for (const kind of ["improvements", "coach-report", "detect-sport"]) {
    assert.ok(staleMinutesForKind(kind) > 30, `${kind} debe tener margen > 30 min`);
  }
});

test("staleMinutesForKind cae al default ante un kind desconocido", () => {
  assert.equal(staleMinutesForKind("kind-inventado"), STALE_MINUTES_BY_KIND.default);
});

test("resolveJobViewStatus reporta queued aunque el job activo tenga error previo", () => {
  // Regresión: durante la ventana de reintento el job está pending con el
  // error del intento anterior; la UI debe ver "en cola", no "falló".
  const activeJob = { status: "pending", error: { kind: "gemini_quota", message: "429" } };
  assert.equal(resolveJobViewStatus(activeJob, null), "queued");
  assert.equal(resolveJobViewStatus(activeJob, { status: "pending" }), "queued");
});

test("resolveJobViewStatus reporta queued para un job en processing", () => {
  assert.equal(resolveJobViewStatus({ status: "processing", error: null }, null), "queued");
});

test("resolveJobViewStatus reporta error solo si el último job terminó en error", () => {
  const latest = { status: "error", error: { kind: "yolo_failed", message: "boom" } };
  assert.equal(resolveJobViewStatus(null, latest), "error");
});

test("resolveJobViewStatus no reporta error si el último job fue exitoso", () => {
  assert.equal(resolveJobViewStatus(null, { status: "done", error: null }), "none");
  assert.equal(resolveJobViewStatus(null, { status: "pending", error: null }), "none");
  assert.equal(resolveJobViewStatus(null, null), "none");
});

test("jobErrorMessage extrae el mensaje y usa el fallback si falta", () => {
  assert.equal(jobErrorMessage({ message: "YOLO explotó" }, "fallback"), "YOLO explotó");
  assert.equal(jobErrorMessage({}, "fallback"), "fallback");
  assert.equal(jobErrorMessage(null, "fallback"), "fallback");
  assert.equal(jobErrorMessage(undefined, "fallback"), "fallback");
});