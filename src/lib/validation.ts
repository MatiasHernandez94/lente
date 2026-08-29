import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres.").max(100).trim(),
  email: z.email("Ingrese un correo válido.").trim(),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres.")
    .regex(/[a-zA-Z]/, "Debe contener al menos una letra.")
    .regex(/[0-9]/, "Debe contener al menos un número."),
});

export const loginSchema = z.object({
  email: z.email("Ingrese un correo válido.").trim(),
  password: z.string().min(1, "Ingrese su contraseña."),
});

export const createVideoSchema = z.object({
  title: z.string().min(3, "El título debe tener al menos 3 caracteres.").max(120).trim(),
  sport: z.enum(["futbol", "padel", "voleibol", "baloncesto"]),
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