import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { EXERCISES } from "./catalog.ts";
import { TRAINING_IMAGES, getTrainingImage } from "./media.ts";

test("las referencias corresponden a fichas existentes y archivos locales", () => {
  for (const [id, path] of Object.entries(TRAINING_IMAGES)) {
    assert.ok(EXERCISES.some((exercise) => exercise.id === id), id);
    assert.match(path, /^\/training-references\/[a-z0-9-]+\.webp$/);
    assert.ok(existsSync(join(process.cwd(), "public", path)), path);
    assert.equal(getTrainingImage(id), path);
  }
  assert.ok(Object.keys(TRAINING_IMAGES).length > 0);
});

test("no asocia referencias para variantes dudosas o ejercicios desconocidos", () => {
  assert.equal(getTrainingImage("peso-muerto-mancuernas"), undefined);
  assert.equal(getTrainingImage("movilidad-tobillo"), undefined);
  assert.equal(getTrainingImage("desplazamiento-banda"), undefined);
  assert.equal(getTrainingImage("inexistente"), undefined);
  assert.equal(getTrainingImage("toString"), undefined);
});
