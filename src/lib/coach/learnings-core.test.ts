import { test } from "node:test";
import assert from "node:assert/strict";
import type { CoachLearning } from "./learnings-core.ts";
import { ORIGEN_WEIGHT, buildLearningText, formatLearningsForPrompt, rankLearnings } from "./learnings-core.ts";

/**
 * Garantías de la memoria de aprendizajes.
 *
 * Journeys que cubren:
 *  5. Aislamiento: los aprendizajes de un usuario no se le inyectan a otro.
 *  6. Recuperación relevante: con tipo de falla conocido manda la coincidencia;
 *     sin saberlo, manda los universales.
 *  7. Restricción sobre ejemplo: el feedback negativo se construye como
 *     "no repitas X", no como ejemplo positivo.
 */

function learning(overrides: Partial<CoachLearning> = {}): CoachLearning {
  return {
    id: "id",
    origen: "curado",
    userId: null,
    sport: "general",
    errorType: null,
    learning: "aprendizaje de prueba",
    videoId: null,
    rating: null,
    uses: 0,
    ...overrides,
  };
}

// ── 5. Aislamiento ──

test("un aprendizaje de usuario no se le inyecta a otra cuenta", () => {
  const visible = rankLearnings(
    [
      learning({ id: "mio", origen: "usuario", userId: "yo", learning: "el mío" }),
      learning({ id: "ajeno", origen: "usuario", userId: "otro", learning: "el ajeno" }),
    ],
    null,
    "yo",
    2,
  );

  const ids = visible.map((l) => l.id);
  assert.deepEqual(ids, ["mio"]);
  assert.ok(!ids.includes("ajeno"), "el ajeno no debe aparecer");
});

test("sin usuario identificado solo se ven los curados", () => {
  const visible = rankLearnings(
    [
      learning({ id: "curado", origen: "curado", learning: "global" }),
      learning({ id: "usuario", origen: "usuario", userId: "alguien", learning: "privado" }),
    ],
    null,
    null,
    2,
  );

  assert.deepEqual(visible.map((l) => l.id), ["curado"]);
});

test("un aprendizaje con rating negativo se descarta", () => {
  const visible = rankLearnings(
    [
      learning({ id: "bueno", origen: "curado", learning: "sirve" }),
      learning({ id: "malo", origen: "curado", rating: 0, learning: "no sirvió" }),
    ],
    null,
    null,
    5,
  );

  assert.deepEqual(visible.map((l) => l.id), ["bueno"]);
});

// ── 6. Recuperación relevante ──

test("con tipo de falla conocido manda la coincidencia primero", () => {
  const visible = rankLearnings(
    [
      learning({ id: "universal", aprendizaje: "sin tipo", errorType: null }),
      learning({ id: "especifico", errorType: "postural", learning: "sobre postura" }),
      learning({ id: "otro-tipo", errorType: "timing", learning: "sobre timing" }),
    ],
    "postural",
    null,
    1,
  );

  assert.equal(visible[0]?.id, "especifico");
});

test("sin tipo conocido, los universales van antes que los etiquetados", () => {
  const visible = rankLearnings(
    [
      learning({ id: "etiquetado", errorType: "postural", learning: "sobre postura" }),
      learning({ id: "universal", errorType: null, learning: "aplica a todo" }),
    ],
    null,
    null,
    1,
  );

  assert.equal(visible[0]?.id, "universal");
});

test("respeta el límite de aprendizaje inyectados", () => {
  const many = Array.from({ length: 8 }, (_, i) =>
    learning({ id: `l${i}`, learning: `aprendizaje ${i}` }),
  );

  assert.equal(rankLearnings(many, null, null, 2).length, 2);
  assert.equal(rankLearnings(many, null, null, 3).length, 3);
});

test("el peso del origen ordena curado > negativo > usuario", () => {
  assert.ok(ORIGEN_WEIGHT.curado > ORIGEN_WEIGHT.negativo);
  assert.ok(ORIGEN_WEIGHT.negativo > ORIGEN_WEIGHT.usuario);
});

// ── 7. Restricción sobre ejemplo ──

test("el feedback negativo con corrección se construye como restricción", () => {
  const text = buildLearningText({
    recommendation: "Subí la cadencia a 160 RPM",
    helpful: false,
    correction: "el ritmo estaba bien, el problema era la altura del salto",
  });

  assert.match(text, /No repitas/);
  assert.match(text, /160 RPM/);
  assert.match(text, /altura del salto/);
  // No debe sonar a ejemplo positivo.
  assert.doesNotMatch(text, /funcionó|mantenelo/i);
});

test("el feedback negativo sin corrección sigue siendo restricción", () => {
  const text = buildLearningText({
    recommendation: "Subí la cadencia",
    helpful: false,
  });

  assert.match(text, /No repitas/);
  assert.match(text, /no aplicaba/);
});

test("el feedback positivo se construye como ajuste validado", () => {
  const text = buildLearningText({
    recommendation: "Mantené el core firme",
    helpful: true,
  });

  assert.match(text, /validado por el usuario/);
  assert.match(text, /core firme/);
  assert.doesNotMatch(text, /No repitas/);
});

// ── Formato para el prompt ──

test("sin aprendizajes el bloque va vacío, no con una sección hueca", () => {
  assert.equal(formatLearningsForPrompt([]), "");
});

test("con aprendizajes el bloque aclara que solo aplican los que correspondan", () => {
  const block = formatLearningsForPrompt([learning()]);
  assert.match(block, /SOLO los que correspondan/);
  assert.match(block, /ignoralo/);
  assert.match(block, /1\. aprendizaje de prueba/);
});
