import { strict as assert } from "node:assert";
import { test } from "node:test";
import { EXERCISES } from "./catalog.ts";
import { BEGINNER_ROUTINE, feedbackMessage } from "./routine.ts";

test("la rutina de ejemplo tiene fases ordenadas y fichas existentes", () => {
  assert.deepEqual([...new Set(BEGINNER_ROUTINE.map((item) => item.phase))], ["Calentamiento", "Trabajo principal", "Vuelta a la calma"]);
  for (const item of BEGINNER_ROUTINE) {
    assert.ok(EXERCISES.some((exercise) => exercise.id === item.exerciseId));
    assert.ok(item.prescription.length > 0);
    assert.ok(item.restSeconds > 0);
  }
});

test("la respuesta de dolor tiene prioridad y nunca aumenta cargas", () => {
  assert.match(feedbackMessage("facil", true), /dolor/i);
  assert.match(feedbackMessage("dificil", false), /profesional/i);
  assert.match(feedbackMessage("moderado", false), /profesional/i);
  assert.match(feedbackMessage("facil", false), /profesional/i);
  assert.match(feedbackMessage(null, false), /sin respuesta/i);
});
