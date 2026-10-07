import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiServiceError } from "../services/errors.ts";
import {
  parseJsonBody,
  readJsonBody,
  sportsOptionsSchema,
  validateInput,
  executionSchema,
  scoutCalibrateSchema,
  scoutSelectSchema,
  streamFrameSchema,
  okrCreateSchema,
  extraerPendientesSchema,
} from "../validation/api.ts";

function requestWith(body: string | null): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    body: body ?? null,
  });
}

function expectApiError(fn: () => unknown): ApiServiceError {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof ApiServiceError, `esperaba ApiServiceError, llegó ${String(error)}`);
    return error;
  }
  assert.fail("esperaba que lanzara ApiServiceError");
}

// ── sportsOptionsSchema: el filtro que protege a Python ────────────────

test("sample_fps acepta valores dentro de rango", () => {
  assert.deepEqual(validateInput({ sample_fps: 5 }, sportsOptionsSchema), { sample_fps: 5 });
  assert.deepEqual(validateInput({ sample_fps: 1 }, sportsOptionsSchema), { sample_fps: 1 });
  assert.deepEqual(validateInput({ sample_fps: 60 }, sportsOptionsSchema), { sample_fps: 60 });
});

test("sample_fps ausente cae en el default 5", () => {
  assert.deepEqual(validateInput({}, sportsOptionsSchema), { sample_fps: 5 });
});

test("sample_fps = 0 se rechaza (rompería Python con ZeroDivisionError)", () => {
  const error = expectApiError(() => validateInput({ sample_fps: 0 }, sportsOptionsSchema));
  assert.equal(error.statusCode, 400);
  assert.match(error.message, /sample_fps/);
});

test("sample_fps negativo se rechaza (procesaría todos los frames)", () => {
  expectApiError(() => validateInput({ sample_fps: -5 }, sportsOptionsSchema));
});

test("sample_fps no numérico se rechaza (produciría nan en Python)", () => {
  expectApiError(() => validateInput({ sample_fps: "abc" }, sportsOptionsSchema));
  expectApiError(() => validateInput({ sample_fps: null }, sportsOptionsSchema));
  expectApiError(() => validateInput({ sample_fps: true }, sportsOptionsSchema));
});

test("sample_fps fuera de rango o fraccionario se rechaza", () => {
  expectApiError(() => validateInput({ sample_fps: 61 }, sportsOptionsSchema));
  expectApiError(() => validateInput({ sample_fps: 9999 }, sportsOptionsSchema));
  expectApiError(() => validateInput({ sample_fps: 5.5 }, sportsOptionsSchema));
});

test("un cuerpo que no es objeto se rechaza", () => {
  expectApiError(() => validateInput("abc", sportsOptionsSchema));
  expectApiError(() => validateInput(null, sportsOptionsSchema));
});

test("validateInput marca invalid_payload para el pipeline de reintentos", () => {
  const error = expectApiError(() => validateInput({ sample_fps: 0 }, sportsOptionsSchema));
  assert.equal(error.kind, "invalid_payload");
});

// ── parseJsonBody / readJsonBody ───────────────────────────────────────

test("parseJsonBody trata el cuerpo vacío como objeto vacío", async () => {
  assert.deepEqual(await parseJsonBody(requestWith(null)), {});
  assert.deepEqual(await parseJsonBody(requestWith("")), {});
  assert.deepEqual(await parseJsonBody(requestWith("   ")), {});
});

test("parseJsonBody devuelve el JSON parseado", async () => {
  assert.deepEqual(await parseJsonBody(requestWith('{"a":1}')), { a: 1 });
});

test("parseJsonBody lanza 400 con JSON malformado", async () => {
  try {
    await parseJsonBody(requestWith("{sample_fps: 5"));
    assert.fail("esperaba error");
  } catch (error) {
    assert.ok(error instanceof ApiServiceError);
    assert.equal(error.statusCode, 400);
    assert.match(error.message, /JSON válido/);
  }
});

test("readJsonBody valida el cuerpo contra el schema", async () => {
  assert.deepEqual(await readJsonBody(requestWith(""), sportsOptionsSchema), { sample_fps: 5 });
  await assert.rejects(
    () => readJsonBody(requestWith('{"sample_fps":0}'), sportsOptionsSchema),
    (error: unknown) => error instanceof ApiServiceError && error.statusCode === 400,
  );
});

// ── formatIssues ───────────────────────────────────────────────────────

test("formatIssues concatena el path con el mensaje", () => {
  let message = "";
  try {
    validateInput({ sample_fps: 0 }, sportsOptionsSchema);
  } catch (error) {
    message = (error as ApiServiceError).message;
  }
  assert.match(message, /sample_fps: /);
  assert.ok(!message.includes("Invalid input"), "los mensajes deben estar en español");
});

// ── el resto de los schemas ────────────────────────────────────────────

test("executionSchema exige exerciseId", () => {
  assert.deepEqual(validateInput({ exerciseId: "sentadilla" }, executionSchema), {
    exerciseId: "sentadilla",
  });
  expectApiError(() => validateInput({}, executionSchema));
  expectApiError(() => validateInput({ exerciseId: "" }, executionSchema));
  expectApiError(() => validateInput({ exerciseId: 123 }, executionSchema));
});

test("scoutSelectSchema aplica defaults y acota el equipo", () => {
  assert.deepEqual(validateInput({}, scoutSelectSchema), {
    trackId: -1,
    name: "",
    team: "A",
  });
  expectApiError(() => validateInput({ team: "Z" }, scoutSelectSchema));
});

test("scoutCalibrateSchema acota cancha y puntos", () => {
  const valid = {
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    court: { width: 400, height: 200 },
  };
  assert.deepEqual(validateInput(valid, scoutCalibrateSchema), valid);
  expectApiError(() => validateInput({ ...valid, court: { width: 0, height: 200 } }, scoutCalibrateSchema));
  expectApiError(() => validateInput({ ...valid, points: [] }, scoutCalibrateSchema));
  expectApiError(() => validateInput({ ...valid, points: [{ x: NaN, y: 0 }] }, scoutCalibrateSchema));
});

test("streamFrameSchema acota el tamaño del frame en base64", () => {
  assert.deepEqual(validateInput({ frameId: 3, image: "abc" }, streamFrameSchema), {
    frameId: 3,
    image: "abc",
  });
  expectApiError(() => validateInput({ frameId: -1, image: "abc" }, streamFrameSchema));
  expectApiError(() => validateInput({ frameId: 1.5, image: "abc" }, streamFrameSchema));
  expectApiError(() => validateInput({ frameId: 1, image: "" }, streamFrameSchema));
  expectApiError(() => validateInput({ frameId: 1, image: "x".repeat(9_000_000) }, streamFrameSchema));
});

test("okrCreateSchema exige título, objetivo y resultados estructurados", () => {
  const valid = {
    title: "Mejorar pase",
    objective: "Subir la precisión",
    keyResults: [{ label: "Pases precisos", target: "80", unit: "%" }],
  };
  assert.deepEqual(validateInput(valid, okrCreateSchema), valid);
  expectApiError(() => validateInput({ title: "", objective: "x", keyResults: [] }, okrCreateSchema));
  expectApiError(() => validateInput({ ...valid, keyResults: ["no es un objeto"] }, okrCreateSchema));
  expectApiError(() => validateInput({ ...valid, keyResults: [{ label: "", target: "" }] }, okrCreateSchema));
});

test("extraerPendientesSchema acota el texto que va a Gemini", () => {
  assert.deepEqual(validateInput({ texto: "  hola  " }, extraerPendientesSchema), { texto: "hola" });
  expectApiError(() => validateInput({ texto: "   " }, extraerPendientesSchema));
  expectApiError(() => validateInput({ texto: "x".repeat(20_001) }, extraerPendientesSchema));
});

test("formatIssues limita la cantidad de problemas listeados", () => {
  let message = "";
  try {
    validateInput(
      {
        title: "",
        objective: "",
        keyResults: [{ label: "" }, { label: "" }, { label: "" }, { label: "" }, { label: "" }],
      },
      okrCreateSchema,
    );
  } catch (error) {
    message = (error as ApiServiceError).message;
  }
  assert.ok(message.split(" | ").length <= 5, message);
});
