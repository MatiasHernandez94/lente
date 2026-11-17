import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CATEGORIES, EXERCISES, filterExercises, getExercise } from "./catalog.ts";

test("el catálogo tiene identificadores únicos y categorías válidas", () => {
  assert.ok(EXERCISES.length >= 12);
  assert.equal(new Set(EXERCISES.map((exercise) => exercise.id)).size, EXERCISES.length);
  for (const exercise of EXERCISES) {
    assert.ok(CATEGORIES.some((category) => category.id === exercise.category));
    assert.ok(exercise.steps.length >= 2);
    assert.ok(exercise.equipment.length > 0);
    assert.ok(exercise.dosage.length > 0 && exercise.caution.length > 0);
    assert.ok(exercise.cues.length >= 2);
  }
  for (const category of CATEGORIES) {
    assert.ok(EXERCISES.filter((exercise) => exercise.category === category.id).length >= 2);
  }
});

test("encuentra las nuevas fichas por equipamiento y categoría", () => {
  assert.ok(filterExercises({ category: "superior", query: "polea" }).some((item) => item.id === "jalon-pecho"));
  assert.ok(filterExercises({ category: "movilidad", query: "colchoneta" }).some((item) => item.id === "rotacion-toracica"));
});

test("busca sin distinguir mayúsculas ni acentos", () => {
  assert.ok(filterExercises({ query: "SENTADILLA" }).some((item) => item.id === "sentadilla-goblet"));
  assert.ok(filterExercises({ query: "TRACCION" }).some((item) => item.category === "superior"));
  assert.deepEqual(filterExercises({ query: "sin coincidencias" }), []);
});

test("filtra por categoría y combina el texto", () => {
  const selected = filterExercises({ category: "inferior", query: "sentadilla" });
  assert.ok(selected.length > 0);
  assert.ok(selected.every((item) => item.category === "inferior"));
  assert.deepEqual(filterExercises({ category: "movilidad", query: "sentadilla" }), []);
  assert.equal(filterExercises({}).length, EXERCISES.length);
});

test("encuentra ejercicios por id y rechaza ids desconocidos", () => {
  assert.equal(getExercise("sentadilla-goblet")?.id, "sentadilla-goblet");
  assert.equal(getExercise("inexistente"), undefined);
});
