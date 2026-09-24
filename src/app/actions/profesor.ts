"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getClient } from "@/lib/db";
import { ensureUserProfile } from "@/lib/repo";
import { linkTutor, getUserByEmail, updateProfile } from "@/lib/profile/service";

export interface VincularAlumnoState {
  errors?: { name?: string[]; email?: string[]; form?: string };
  message?: string;
  success?: boolean;
}

/**
 * Vincula un alumno/a al profesor actual. Si se indica email y existe una cuenta,
 * la enlaza; si no existe (o no se indicó email), crea un perfil de alumno.
 * Al finalizar redirige a la carga del nuevo análisis.
 */
export async function vincularAlumno(
  _prevState: VincularAlumnoState | undefined,
  formData: FormData,
): Promise<VincularAlumnoState> {
  const user = await getSessionUser();
  if (!user || user.rol !== "profesor") {
    return { message: "Solo un profesor puede vincular alumnos." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  const errors: VincularAlumnoState["errors"] = {};
  if (!name) errors.name = ["Escribí el nombre del alumno/a."];
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = ["El correo no es válido."];
  if (errors.name || errors.email) {
    return { errors, message: "Revise los campos indicados." };
  }

  try {
    let alumnoId: string;

    if (email) {
      const existing = await getUserByEmail(email);
      if (existing) {
        if (existing.rol !== "alumno" && existing.rol !== "profesor") {
          return { message: "Ese correo no corresponde a un perfil válido." };
        }
        if (existing.rol === "profesor") {
          return { message: "Ese correo pertenece a un profesor, no a un alumno." };
        }
        alumnoId = existing.id;
      } else {
        const password = `tmp-${randomUUID()}`;
        const { data, error } = await getClient().auth.admin.createUser({
          email,
          password,
          email_confirm: false,
          user_metadata: { name },
        });
        if (error) throw new Error(`No se pudo crear la cuenta del alumno/a: ${error.message}`);
        alumnoId = data.user.id;

        await ensureUserProfile({
          id: alumnoId,
          name,
          email,
          createdAt: data.user.created_at,
        });
      }
    } else {
      const { data, error } = await getClient()
        .from("users")
        .insert({
          id: randomUUID(),
          name,
          email: `${randomUUID()}@sin-cuenta.lente.dev`,
          rol: "alumno",
          deporte_docente: null,
          tutor_email: null,
          terms_accepted: true,
          terms_accepted_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw new Error(`No se pudo crear el perfil del alumno/a: ${error.message}`);
      alumnoId = data.id;
    }

    await updateProfile(alumnoId, { rol: "alumno" });

    await linkTutor(alumnoId, user.email);
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : "No se pudo vincular al alumno/a.",
      errors: { form: error instanceof Error ? error.message : undefined },
    };
  }

  redirect("/app/nuevo");
}