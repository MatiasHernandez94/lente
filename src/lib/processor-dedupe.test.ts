import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createOrReuseActiveJob } from "./processor-dedupe.ts";

test("reutiliza el job activo sin insertar otro", async () => {
  const result = await createOrReuseActiveJob({
    find: async () => ({ id: "existente" }),
    insert: async () => { throw new Error("no debe insertar"); },
  });
  assert.deepEqual(result, { job: { id: "existente" }, isWinner: false });
});

test("devuelve el job insertado como ganador", async () => {
  const result = await createOrReuseActiveJob({
    find: async () => null,
    insert: async () => ({ job: { id: "nuevo" }, error: null }),
  });
  assert.deepEqual(result, { job: { id: "nuevo" }, isWinner: true });
});

test("ante inserciones simultáneas reutiliza el ganador del índice único", async () => {
  let reads = 0;
  const result = await createOrReuseActiveJob({
    find: async () => ++reads === 1 ? null : { id: "ganador" },
    insert: async () => ({ job: null, error: { code: "23505", message: "duplicate" } }),
  });
  assert.deepEqual(result, { job: { id: "ganador" }, isWinner: false });
});

test("no oculta errores de base de datos ni conflictos sin ganador activo", async () => {
  for (const code of ["23505", "08006"]) {
    await assert.rejects(createOrReuseActiveJob({
      find: async () => null,
      insert: async () => ({ job: null, error: { code, message: "falló" } }),
    }), /falló/);
  }
});
