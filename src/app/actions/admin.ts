"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateProfile } from "@/lib/profile/service";
import { DEMO_USERS, DEMO_PASSWORD, ensureDemoUsers, isDemoAdminEnabled } from "@/lib/admin/demo";
import type { UserRol } from "@/lib/schema";

/**
 * Entra al panel como usuario de demostración con credenciales fijas:
 * admin.profesor@lente.dev (perfil profesor) o admin.alumno@lente.dev
 * (perfil alumno). No se envía ningún correo.
 *
 * El rol se pasa explícitamente desde una server action dedicada por botón y no
 * por `name`/`value` en el `<button formAction={...}>`: React sobrescribe ese
 * `name` al codificar la acción, así que el valor nunca llegaría.
 */
async function enterDemoAs(rol: UserRol): Promise<{ success: boolean; message: string }> {
  if (!isDemoAdminEnabled()) {
    return { success: false, message: "El acceso de administrador de demostración está deshabilitado." };
  }

  if (!DEMO_USERS[rol]) {
    return { success: false, message: "Perfil de demostración inválido." };
  }

  try {
    await ensureDemoUsers();
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo preparar el usuario demo.",
    };
  }

  const { email } = DEMO_USERS[rol];
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: DEMO_PASSWORD });

  if (error || !data.user) {
    return { success: false, message: "No se pudo iniciar la sesión demo." };
  }

  try {
    await updateProfile(data.user.id, {
      rol,
      deporteDocente: rol === "profesor" ? "Fútbol" : null,
      termsAccepted: true,
    });
  } catch {
    return { success: false, message: "No se pudo preparar el perfil demo." };
  }

  redirect(rol === "profesor" ? "/app/profesor" : "/app");
}

export async function enterDemoProfesor(
  _prevState: unknown,
  _formData: FormData,
): Promise<{ success: boolean; message: string }> {
  return enterDemoAs("profesor");
}

export async function enterDemoAlumno(
  _prevState: unknown,
  _formData: FormData,
): Promise<{ success: boolean; message: string }> {
  return enterDemoAs("alumno");
}