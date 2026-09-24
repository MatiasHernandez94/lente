"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getVideoById } from "@/lib/repo";
import { correccionSchema } from "@/lib/validation";
import { isAlumnoOf } from "@/lib/profile/service";
import { createCorreccion, deleteCorreccion } from "@/lib/correccion/service";

export interface CorreccionFormState {
  errors?: {
    mensaje?: string[];
    minutoInicio?: string[];
    minutoFin?: string[];
    form?: string;
  };
  message?: string;
  success?: boolean;
}

export async function addCorreccion(
  _prevState: CorreccionFormState | undefined,
  formData: FormData,
): Promise<CorreccionFormState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.rol !== "profesor") {
    return { message: "Solo los profesores pueden dejar correcciones.", success: false };
  }

  const videoId = formData.get("videoId");
  const alumnoId = formData.get("alumnoId");
  if (!videoId || !alumnoId) {
    return { message: "Falta el video o el alumno.", success: false };
  }

  const [video, linked] = await Promise.all([
    getVideoById(String(videoId)),
    isAlumnoOf(user.id, String(alumnoId)),
  ]);
  if (!video || video.userId !== String(alumnoId)) {
    return { message: "El video no pertenece a ese alumno.", success: false };
  }
  if (!linked) {
    return { message: "Ese alumno no está vinculado a tu perfil de profesor.", success: false };
  }

  const parsed = correccionSchema.safeParse({
    mensaje: formData.get("mensaje"),
    minutoInicio: formData.get("minutoInicio"),
    minutoFin: formData.get("minutoFin"),
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors, message: "Revise los campos indicados." };
  }

  await createCorreccion({
    videoId: String(videoId),
    profesorId: user.id,
    alumnoId: String(alumnoId),
    mensaje: parsed.data.mensaje,
    minutoInicio: parsed.data.minutoInicio,
    minutoFin: parsed.data.minutoFin,
  });

  return { success: true, message: "Corrección guardada." };
}

export async function deleteCorreccionAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const correccionId = formData.get("correccionId");
  if (!correccionId) return;

  await deleteCorreccion(String(correccionId));
}