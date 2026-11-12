import { strict as assert } from "node:assert";
import { test } from "node:test";
import { fingerprintVideo } from "./fingerprint.ts";

test("la huella depende del contenido completo, no del nombre", async () => {
  const content = new Uint8Array([1, 2, 3, 4]);
  assert.equal(await fingerprintVideo(new File([content], "uno.mp4")), await fingerprintVideo(new File([content], "otro.mov")));
  assert.notEqual(await fingerprintVideo(new Blob([content])), await fingerprintVideo(new Blob([new Uint8Array([1, 2, 3, 5])])));
});

test("incluye todos los bloques y detecta cambios en el último", async () => {
  const bytes = new Uint8Array(4 * 1024 * 1024 + 1);
  const changed = bytes.slice();
  changed[changed.length - 1] = 1;
  assert.notEqual(await fingerprintVideo(new Blob([bytes])), await fingerprintVideo(new Blob([changed])));
});

test("rechaza archivos vacíos", async () => {
  await assert.rejects(fingerprintVideo(new Blob([])), /vacío/);
});
