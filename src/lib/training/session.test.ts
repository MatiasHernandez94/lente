import { strict as assert } from "node:assert";
import { test } from "node:test";
import { remainingSeconds, nextExerciseIndex } from "./session.ts";

test("el descanso usa tiempo transcurrido real y no baja de cero", () => {
  assert.equal(remainingSeconds(10000, 1000), 9);
  assert.equal(remainingSeconds(10000, 1550), 9);
  assert.equal(remainingSeconds(10000, 11000), 0);
});

test("avanza solo hasta el final de la selección", () => {
  assert.equal(nextExerciseIndex(0, 2), 1);
  assert.equal(nextExerciseIndex(1, 2), null);
  assert.equal(nextExerciseIndex(0, 0), null);
  assert.equal(nextExerciseIndex(-1, 2), null);
});
