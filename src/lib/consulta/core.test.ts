import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveProfesorId, groupConsultasPendientes } from "./core.ts";

// ── resolveProfesorId ──

test("sin tutores no hay profesor al que preguntar", () => {
  assert.equal(resolveProfesorId([]), null);
});

test("con un solo tutor, ese es el profesor del hilo", () => {
  assert.equal(resolveProfesorId([{ id: "p1", name: "Ana" }]), "p1");
});

test("con varios tutores, la elección es determinista (orden por id)", () => {
  const a = resolveProfesorId([
    { id: "z9", name: "Zoe" },
    { id: "a1", name: "Ana" },
    { id: "m5", name: "Marcos" },
  ]);
  const b = resolveProfesorId([
    { id: "m5", name: "Marcos" },
    { id: "a1", name: "Ana" },
    { id: "z9", name: "Zoe" },
  ]);
  assert.equal(a, "a1");
  assert.equal(a, b, "el resultado no debe depender del orden de la base");
});

test("resolveProfesorId no muta el arreglo de entrada", () => {
  const tutores = [
    { id: "z9", name: "Zoe" },
    { id: "a1", name: "Ana" },
  ];
  resolveProfesorId(tutores);
  assert.deepEqual(
    tutores.map((t) => t.id),
    ["z9", "a1"],
    "ordenar una copia, no el arreglo original",
  );
});

// ── groupConsultasPendientes ──

test("sin mensajes no hay hilos pendientes", () => {
  assert.deepEqual(groupConsultasPendientes([]), []);
});

test("un mensaje del alumno sin leer abre un hilo pendiente", () => {
  const hilos = groupConsultasPendientes([
    { videoId: "v1", leida: false, autorRol: "alumno", mensaje: "¿Está bien la postura?", createdAt: "2026-01-01T10:00:00Z" },
  ]);
  assert.equal(hilos.length, 1);
  assert.equal(hilos[0].videoId, "v1");
  assert.equal(hilos[0].unreadCount, 1);
  assert.equal(hilos[0].lastMessage, "¿Está bien la postura?");
});

test("la respuesta del profesor no reabre el hilo", () => {
  const hilos = groupConsultasPendientes([
    { videoId: "v1", leida: true, autorRol: "alumno", mensaje: "Pregunta", createdAt: "2026-01-01T10:00:00Z" },
    { videoId: "v1", leida: false, autorRol: "profesor", mensaje: "Respuesta", createdAt: "2026-01-01T11:00:00Z" },
  ]);
  assert.equal(hilos.length, 0, "lo no leído del propio profesor no es pendiente para él");
});

test("varios mensajes del alumno se cuentan todos", () => {
  const hilos = groupConsultasPendientes([
    { videoId: "v1", leida: false, autorRol: "alumno", mensaje: "Uno", createdAt: "2026-01-01T10:00:00Z" },
    { videoId: "v1", leida: false, autorRol: "alumno", mensaje: "Dos", createdAt: "2026-01-01T10:05:00Z" },
  ]);
  assert.equal(hilos[0].unreadCount, 2);
  assert.equal(hilos[0].lastMessage, "Dos", "el último mensaje es el más reciente");
});

test("hilos de videos distintos se separan y ordenan por recencia", () => {
  const hilos = groupConsultasPendientes([
    { videoId: "v1", leida: false, autorRol: "alumno", mensaje: "A", createdAt: "2026-01-01T10:00:00Z" },
    { videoId: "v2", leida: false, autorRol: "alumno", mensaje: "B", createdAt: "2026-01-02T10:00:00Z" },
  ]);
  assert.equal(hilos.length, 2);
  assert.equal(hilos[0].videoId, "v2", "el más reciente primero");
});

test("un hilo ya leído no aparece en pendientes", () => {
  const hilos = groupConsultasPendientes([
    { videoId: "v1", leida: true, autorRol: "alumno", mensaje: "Ya vista", createdAt: "2026-01-01T10:00:00Z" },
  ]);
  assert.deepEqual(hilos, []);
});
