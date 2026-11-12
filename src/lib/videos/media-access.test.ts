import { strict as assert } from "node:assert";
import { test } from "node:test";
import { canReadMedia } from "./media-access.ts";

test("el dueño puede acceder sin consultar vínculos", async () => {
  assert.equal(await canReadMedia({ id: "a", rol: "alumno" }, ["b", "a"], async () => { throw Error("no consultar"); }), true);
});

test("el profesor vinculado puede acceder a un video de su alumno", async () => {
  assert.equal(await canReadMedia({ id: "p", rol: "profesor" }, ["a"], async (p, a) => p === "p" && a === "a"), true);
});

test("otras cuentas y profesores no vinculados no acceden", async () => {
  assert.equal(await canReadMedia({ id: "otro", rol: "alumno" }, ["a"], async () => true), false);
  assert.equal(await canReadMedia({ id: "p", rol: "profesor" }, ["a"], async () => false), false);
  assert.equal(await canReadMedia({ id: "p", rol: "profesor" }, [], async () => true), false);
});

test("referencias compartidas admiten a cualquier dueño o profesor vinculado", async () => {
  assert.equal(await canReadMedia({ id: "p", rol: "profesor" }, ["a", "b"], async (_p, a) => a === "b"), true);
});

test("un error consultando permisos no autoriza el acceso", async () => {
  await assert.rejects(canReadMedia({ id: "p", rol: "profesor" }, ["a"], async () => { throw Error("db"); }), /db/);
});
