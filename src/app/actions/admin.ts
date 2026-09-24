"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClient } from "@/lib/db";
import { updateProfile } from "@/lib/profile/service";
import { ensureDemoUser, isDemoAdminEnabled, demoAdminEmail } from "@/lib/admin/demo";
import type { UserRol } from "@/lib/schema";

/**
 * Entra al panel como administrador de demostración sin contraseña.
 * La sesión se firma server-side con el token de enlace mágico emitido por
 * la API de administración de Supabase; no se envía ningún correo.
 */
export async function enterDemoAdmin(
  _prevState: unknown,
  formData: FormData,
): Promise<{ success: boolean; message: string }> {
  if (!isDemoAdminEnabled()) {
    return { success: false, message: "El acceso de administrador de demostración está deshabilitado." };
  }

  const rol = (formData.get("rol") as UserRol | null) ?? "profesor";
  if (rol !== "profesor" && rol !== "alumno") {
    return { success: false, message: "Perfil de demostración inválido." };
  }

  try {
    await ensureDemoUser(rol);

    const admin = getClient();
    const email = demoAdminEmail();
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: "/auth/callback?next=/app" },
    });
    if (linkError) throw new Error(`No se pudo generar el acceso demo: ${linkError.message}`);
    const token = link.properties?.email_otp ?? link.properties?.hashed_token;
    if (!token) throw new Error("El acceso demo no devolvió un token válido.");

    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: "magiclink",
      email,
      token,
      options: { redirectTo: "/auth/callback?next=/app" },
    });
    if (error) throw new Error(`No se pudo iniciar la sesión demo: ${error.message}`);

    redirect(rol === "profesor" ? "/app/profesor" : "/app");
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "No se pudo entrar al modo demo." };
  }
}

/** Cambia el perfil del usuario actual entre alumno y profesor (viaje entre perfiles). */
export async function switchProfile(
  _prevState: unknown,
  formData: FormData,
): Promise<{ success: boolean; message: string }> {
  const rol = formData.get("rol") as UserRol | null;
  if (rol !== "profesor" && rol !== "alumno") {
    return { success: false, message: "Perfil inválido." };
  }

  const email = demoAdminEmail();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { success: false, message: "Sesión no válida." };

  if (user.email.toLowerCase() !== email.toLowerCase()) {
    return { success: false, message: "Solo la cuenta de administrador puede viajar entre perfiles." };
  }

  await updateProfile(user.id, {
    rol,
    deporteDocente: rol === "profesor" ? "Fútbol" : null,
  });

  redirect(rol === "profesor" ? "/app/profesor" : "/app");
}