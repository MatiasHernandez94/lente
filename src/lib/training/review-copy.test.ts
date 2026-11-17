import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { EXERCISES } from "./catalog.ts";
import { TRAINING_IMAGES } from "./media.ts";

const paths = [
  "src/app/app/entrenamientos/page.tsx",
  "src/app/app/entrenamientos/[id]/page.tsx",
  "src/app/app/entrenamientos/guia/page.tsx",
  "src/components/app/BeginnerRoutine.tsx",
  "src/components/app/TrainingReference.tsx",
];

test("los avisos reflejan la revisión y conservan límites de seguridad", () => {
  const text = paths.map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(text, /pendiente de revisión profesional|aún no fue revisado profesionalmente|es un borrador|Propuesta pendiente de revisión/i);
  assert.match(text, /revisad[oa] por un personal trainer/i);
  assert.match(text, /no es una (rutina|prescripción) personalizada/i);
  assert.match(text, /no demuestra el movimiento completo/i);
  assert.match(text, /Video de demostración pendiente/i);
});

test("el alcance revisado debe actualizarse antes de añadir fichas o imágenes", () => {
  assert.equal(EXERCISES.length, 12);
  assert.equal(Object.keys(TRAINING_IMAGES).length, 8);
});
