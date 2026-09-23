import { z } from "zod";

const optionalNumber = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : Number(value)),
  z.number({ message: "Ingrese un valor numérico." }).positive().max(500, "Valor fuera de rango."),
);

export const registerSchema = z
  .object({
    name: z.string().min(2, "El nombre debe tener al menos 2 caracteres.").max(100).trim(),
    email: z.email("Ingrese un correo válido.").trim(),
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres.")
      .regex(/[a-zA-Z]/, "Debe contener al menos una letra.")
      .regex(/[0-9]/, "Debe contener al menos un número."),
    pesoKg: optionalNumber.optional(),
    alturaCm: optionalNumber.optional(),
    rol: z.enum(["alumno", "profesor"]).default("alumno"),
    deporteDocente: z
      .string()
      .trim()
      .max(60, "El deporte es demasiado largo.")
      .optional()
      .transform((v) => v === "" ? undefined : v),
    deportes: z
      .array(
        z
          .string()
          .trim()
          .min(1, "El deporte no puede quedar vacío.")
          .max(60, "El deporte es demasiado largo."),
      )
      .max(10, "Máximo 10 deportes por persona.")
      .default([]),
    tutorEmail: z
      .email("Ingrese un correo de tutor válido.")
      .trim()
      .optional()
      .or(z.literal("")),
    termsAccepted: z.boolean().refine((v) => v === true, "Debe aceptar los términos y condiciones."),
  })
  .superRefine((data, ctx) => {
    if (data.rol === "profesor" && !data.deporteDocente) {
      ctx.addIssue({
        code: "custom",
        path: ["deporteDocente"],
        message: "Indique qué deporte enseña.",
      });
    }
    if (data.rol === "profesor" && data.deportes.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["deportes"],
        message: "Indique los deportes que enseña.",
      });
    }
  });

export const profileSchema = z.object({
  pesoKg: optionalNumber.optional(),
  alturaCm: optionalNumber.optional(),
  deporteDocente: z
    .string()
    .trim()
    .max(60, "El deporte es demasiado largo.")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  tutorEmail: z
    .email("Ingrese un correo de tutor válido.")
    .trim()
    .optional()
    .or(z.literal("")),
});

export const loginSchema = z.object({
  email: z.email("Ingrese un correo válido.").trim(),
  password: z.string().min(1, "Ingrese su contraseña."),
});

export const forgotPasswordSchema = z.object({
  email: z.email("Ingrese un correo válido.").trim(),
});

export const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres.")
    .regex(/[a-zA-Z]/, "Debe contener al menos una letra.")
    .regex(/[0-9]/, "Debe contener al menos un número."),
});

export const createVideoSchema = z.object({
  title: z.string().min(3, "El título debe tener al menos 3 caracteres.").max(120).trim(),
  sport: z.enum(["general", "futbol", "padel", "voleibol", "baloncesto"]).default("general"),
  sourceType: z.enum(["camera", "upload", "youtube"]),
  sourceRef: z.string().max(500).trim().nullable().optional(),
  durationSeconds: z.number().int().min(120).max(86400),
  players: z
    .array(
      z
        .string()
        .trim()
        .min(1, "El nombre del jugador no puede quedar vacío.")
        .max(60, "El nombre del jugador es demasiado largo."),
    )
    .max(20, "Máximo 20 jugadores por análisis.")
    .default([]),
});

export const ytUrlSchema = z
  .string()
  .max(500)
  .trim()
  .regex(/^https?:\/\/(www\.)?youtu(\.be|be\.com)\//, "Ingrese una URL de YouTube válida.");