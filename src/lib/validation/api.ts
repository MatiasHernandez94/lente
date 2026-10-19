import { z } from "zod";
import { ApiServiceError } from "../services/errors.ts";

/**
 * Filtro de validación para cuerpos de request.
 *
 * Reglas:
 * - Un cuerpo vacío se trata como `{}` para que los defaults del schema se
 *   apliquen (el cliente de la app hace `fetch(..., { method: "POST" })` sin
 *   body en varias rutas).
 * - JSON malformado o datos inválidos → 400 antes de tocar la base, Python o
 *   la API de IA.
 */

export async function parseJsonBody(request: Request): Promise<unknown> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    throw new ApiServiceError(400, "No se pudo leer el cuerpo de la solicitud.");
  }
  if (raw.trim() === "") return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ApiServiceError(400, "El cuerpo de la solicitud no es JSON válido.");
  }
}

/**
 * Valida un valor ya parseado contra un schema.
 *
 * Lanza `ApiServiceError(400)` con `kind: "invalid_payload"`, de modo que en
 * una ruta responde 400 y en el worker `errorPayload()` clasifica el job como
 * permanente: un payload corrupto no se arregla solo, reintentar es gastar
 * intentos en un fallo determinista.
 */
export function validateInput<S extends z.ZodType>(
  input: unknown,
  schema: S,
): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiServiceError(400, formatIssues(result.error), "invalid_payload");
  }
  return result.data;
}

export async function readJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  return validateInput(await parseJsonBody(request), schema);
}

export function formatIssues(error: z.ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return issues.slice(0, 5).join(" | ") || "Datos inválidos.";
}

/** Extensión segura para subir video. */
export const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"] as const;

// ── videos/[id]/sports ─────────────────────────────────────────────────
/**
 * El único parámetro que llega a Python. Sin este filtro, `sample_fps: 0`
 * revienta con ZeroDivisionError en detect_players.py:274, un negativo
 * procesa los 425 frames del video y `"abc"` produce `nan`.
 */
export const sportsOptionsSchema = z.object({
  sample_fps: z
    .number({ message: "Debe ser un número." })
    .int("Debe ser un número entero.")
    .min(1, "Debe ser al menos 1.")
    .max(60, "No puede superar 60.")
    .default(3),
});
export type SportsOptions = z.infer<typeof sportsOptionsSchema>;

// ── videos/[id] (PATCH) ────────────────────────────────────────────────
export const videoPatchSchema = z.object({
  title: z
    .string({ message: "El título debe ser un texto." })
    .trim()
    .min(3, "El título debe tener al menos 3 caracteres.")
    .max(120, "El título no puede superar 120 caracteres."),
  sport: z.string({ message: "El deporte debe ser un texto." }).trim().max(60),
});

// ── upload ─────────────────────────────────────────────────────────────
export const uploadConfirmSchema = z.object({
  file: z
    .string({ message: "Debe indicar el archivo." })
    .trim()
    .min(1, "Debe indicar el archivo.")
    .max(200, "Nombre de archivo demasiado largo."),
});

// ── videos/[id]/asignacion (PUT) ───────────────────────────────────────
export const asignacionSchema = z.object({
  alumnoId: z
    .string({ message: "El alumno debe ser un texto." })
    .trim()
    .max(100)
    .nullable()
    .optional(),
});

// ── videos/[id]/execution (POST / PATCH) ───────────────────────────────
export const executionSchema = z.object({
  exerciseId: z
    .string({ message: "Debe indicar el ejercicio." })
    .trim()
    .min(1, "Se requiere un exerciseId.")
    .max(100, "Identificador de ejercicio inválido."),
});

// ── videos/[id]/scout/select ───────────────────────────────────────────
export const scoutSelectSchema = z.object({
  trackId: z.number({ message: "Debe ser un número." }).int().default(-1),
  name: z
    .string({ message: "El nombre debe ser un texto." })
    .trim()
    .max(60, "El nombre no puede superar 60 caracteres.")
    .default(""),
  team: z.enum(["A", "B"], { message: "El equipo debe ser A o B." }).default("A"),
});

// ── videos/[id]/scout/calibrate ────────────────────────────────────────
const courtPointSchema = z.object({
  x: z.number({ message: "La coordenada x debe ser un número." }).finite(),
  y: z.number({ message: "La coordenada y debe ser un número." }).finite(),
});
export const scoutCalibrateSchema = z.object({
  points: z
    .array(courtPointSchema, { message: "Debe indicar los puntos de la cancha." })
    .min(1, "Debe indicar al menos un punto.")
    .max(50, "Demasiados puntos."),
  court: z.object({
    width: z
      .number({ message: "El ancho debe ser un número." })
      .positive("El ancho debe ser mayor a cero.")
      .max(10_000, "Ancho fuera de rango."),
    height: z
      .number({ message: "El alto debe ser un número." })
      .positive("El alto debe ser mayor a cero.")
      .max(10_000, "Alto fuera de rango."),
  }),
});

// ── videos/[id]/okrs (POST) ────────────────────────────────────────────
const keyResultSchema = z.object({
  label: z.string({ message: "Cada resultado clave necesita un texto." }).trim().min(1, "Cada resultado clave necesita un texto.").max(200),
  target: z.string({ message: "Cada resultado clave necesita una meta." }).trim().min(1, "Cada resultado clave necesita una meta.").max(200),
  unit: z.string({ message: "La unidad debe ser un texto." }).trim().max(40).optional(),
});
export const okrCreateSchema = z.object({
  title: z.string({ message: "Debe indicar un título." }).trim().min(1, "Debe indicar un título.").max(200),
  objective: z.string({ message: "Debe indicar un objetivo." }).trim().min(1, "Debe indicar un objetivo.").max(500),
  keyResults: z
    .array(keyResultSchema, { message: "Los resultados clave deben ser una lista." })
    .max(20, "Demasiados resultados clave."),
});

// ── clips ──────────────────────────────────────────────────────────────
export const clipSchema = z.object({
  correccionId: z
    .string({ message: "Debe indicar la corrección." })
    .trim()
    .min(1, "Debe indicar la corrección.")
    .max(100),
});

// ── stream ─────────────────────────────────────────────────────────────
export const streamActionSchema = z.object({
  action: z.enum(["start", "stop"], { message: "La acción debe ser start o stop." }).optional(),
  videoId: z
    .string({ message: "Debe indicar el video." })
    .trim()
    .min(1, "videoId requerido.")
    .max(100),
});

/**
 * Frame en base64 enviado al worker de Python. El límite es deliberadamente
 * holgado (un JPEG 1920x1080 queda en ~400 KB) pero evita que un cliente
 * mande un payload sin acotar y dispare la memoria del worker.
 */
export const streamFrameSchema = z.object({
  frameId: z
    .number({ message: "frameId debe ser un número." })
    .int("frameId debe ser un número entero.")
    .min(0, "frameId no puede ser negativo."),
  image: z
    .string({ message: "image debe ser un texto." })
    .min(1, "image es obligatorio.")
    .max(8_000_000, "El frame supera el tamaño máximo permitido."),
});

// ── extraer-pendientes ─────────────────────────────────────────────────
export const extraerPendientesSchema = z.object({
  texto: z
    .string({ message: "Debe indicar el texto." })
    .trim()
    .min(1, "Falta el texto")
    .max(20_000, "El texto supera el máximo de 20.000 caracteres."),
});
