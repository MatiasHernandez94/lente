import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateRemainingSeconds,
  isProgressFresh,
  parseProgress,
  progressPathFor,
} from "../job-progress.ts";

const NOW = new Date("2026-10-05T12:00:00.000Z");

test("progressPathFor deja el progreso junto a la salida", () => {
  assert.equal(progressPathFor("/tmp/x.json"), "/tmp/x.json.progress");
});

test("parseProgress calcula el porcentaje a partir de los fotogramas", () => {
  const p = parseProgress('{"stage":"YOLO","frames_done":250,"frames_total":1000}', NOW);
  assert.equal(p?.pct, 25);
  assert.equal(p?.framesDone, 250);
  assert.equal(p?.framesTotal, 1000);
  assert.equal(p?.stage, "YOLO");
});

test("parseProgress acepta el nombre de campo en camelCase", () => {
  const p = parseProgress('{"framesDone":50,"framesTotal":200}', NOW);
  assert.equal(p?.pct, 25);
});

test("parseProgress respeta un pct explícito", () => {
  const p = parseProgress('{"pct":92,"stage":"Calculando metricas"}', NOW);
  assert.equal(p?.pct, 92);
});

test("parseProgress deja pct en null si no conoce el total", () => {
  const p = parseProgress('{"stage":"YOLO"}', NOW);
  assert.equal(p?.pct, null);
  assert.equal(p?.stage, "YOLO");
});

test("parseProgress normaliza el stage vacio", () => {
  const p = parseProgress('{"stage":"   ","frames_done":1,"frames_total":2}', NOW);
  assert.equal(p?.stage, "Procesando con YOLOv8");
});

test("parseProgress ignora basura y no lanza", () => {
  assert.equal(parseProgress("no es json", NOW), null);
  assert.equal(parseProgress("[]", NOW), null);
  assert.equal(parseProgress("null", NOW), null);
});

test("parseProgress acota el porcentaje al rango 0-100", () => {
  assert.equal(parseProgress('{"pct":250}', NOW)?.pct, 100);
  assert.equal(parseProgress('{"frames_done":9999,"frames_total":1000}', NOW)?.pct, 100);
});

test("parseProgress descarta un porcentaje negativo en vez de mentir un 0%", () => {
  // 0% es una afirmación real ("no avanzó"); mejor no reportar progreso.
  assert.equal(parseProgress('{"pct":-10}', NOW), null);
  assert.equal(parseProgress('{"pct":"abc"}', NOW), null);
});

test("parseProgress usa la marca de tiempo externa si viene", () => {
  const p = parseProgress('{"pct":10,"updated_at":"2026-10-05T11:59:00.000Z"}', NOW);
  assert.equal(p?.updatedAt, "2026-10-05T11:59:00.000Z");
});

test("isProgressFresh descarta el progreso de un worker muerto", () => {
  const reciente = parseProgress('{"pct":50}', NOW)!;
  assert.equal(isProgressFresh(reciente, NOW), true);

  const viejo = { ...reciente, updatedAt: "2026-10-05T11:00:00.000Z" };
  assert.equal(isProgressFresh(viejo, NOW), false, "un progreso de hace 1h no debe prometer avance");
});

test("isProgressFresh rechaza una fecha invalida", () => {
  const roto = { pct: 10, stage: "x", framesDone: null, framesTotal: null, updatedAt: "nope" };
  assert.equal(isProgressFresh(roto, NOW), false);
});

test("estimateRemainingSeconds proyecta el total a partir del avance", () => {
  // 60 s al 25% -> 240 s total -> quedan 180 s
  assert.equal(estimateRemainingSeconds(60, 25), 180);
  assert.equal(estimateRemainingSeconds(60, 100), 0);
  assert.equal(estimateRemainingSeconds(60, 0), null);
  assert.equal(estimateRemainingSeconds(60, null), null);
  assert.equal(estimateRemainingSeconds(0, 50), null);
});