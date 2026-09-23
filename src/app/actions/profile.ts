"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { profileSchema } from "@/lib/validation";
import {
  ensureDeporte,
  linkTutor,
  setUserDeportes,
  updateProfile,
  deleteUserById,
} from "@/lib/profile/service";

export interface ProfileFormState {
  errors?: {
    pesoKg?: string[];
    alturaCm?: string[];
    deporteDocente?: string[];
    tutorEmail?: string[];
    deportes?: string[];
    form?: string;
  };
  message?: string;
  success?: boolean;
}

export async function updateProfileAction(
  _prevState: ProfileFormState | undefined,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const parsed = profileSchema.safeParse({
    pesoKg: formData.get("pesoKg"),
    alturaCm: formData.get("alturaCm"),
    deporteDocente: formData.get("deporteDocente"),
    tutorEmail: formData.get("tutorEmail"),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors, message: "Revise los campos indicados." };
  }

  const { pesoKg, alturaCm, deporteDocente, tutorEmail } = parsed.data;

  await updateProfile(user.id, {
    pesoKg: pesoKg ?? null,
    alturaCm: alturaCm ?? null,
    deporteDocente: user.rol === "profesor" ? (deporteDocente ?? null) : undefined,
    tutorEmail: user.rol === "alumno" ? (tutorEmail ?? null) : undefined,
  });

  const deporteIds: string[] = [];
  const deportes = formData.getAll("deportes");
  for (const raw of deportes) {
    const nombre = String(raw).trim();
    if (!nombre) continue;
    const deporte = await ensureDeporte(nombre);
    deporteIds.push(deporte.id);
  }
  await setUserDeportes(user.id, deporteIds);

  if (user.rol === "alumno" && tutorEmail) {
    const linked = await linkTutor(user.id, tutorEmail);
    if (!linked) {
      return {
        message: "Perfil actualizado, pero no encontramos un profesor registrado con ese correo.",
        success: false,
      };
    }
  }

  return { success: true, message: "Perfil actualizado correctamente." };
}

export async function deleteAccountAction(): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  await deleteUserById(user.id);
  redirect("/");
}