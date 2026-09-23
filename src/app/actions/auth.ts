"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureUserProfile } from "@/lib/repo";
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/validation";
import { ensureDeporte, linkTutor, setUserDeportes, updateProfile } from "@/lib/profile/service";
import { assertNotRateLimited } from "@/lib/rateLimit";
import type { UserRol } from "@/lib/schema";

export interface AuthFormState {
  errors?: {
    name?: string[];
    email?: string[];
    password?: string[];
    token?: string[];
    pesoKg?: string[];
    alturaCm?: string[];
    rol?: string[];
    deporteDocente?: string[];
    deportes?: string[];
    tutorEmail?: string[];
    termsAccepted?: string[];
    form?: string;
  };
  message?: string;
  success?: boolean;
}

async function clientIp(): Promise<string> {
  const list = (await headers()).get("x-forwarded-for")?.split(",");
  return list?.[0]?.trim() || "local";
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function authErrorMessage(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("already registered") || normalized.includes("already been registered")) {
    return "Ya existe una cuenta con ese correo.";
  }
  if (normalized.includes("invalid login") || normalized.includes("invalid credentials")) {
    return "Correo o contraseña incorrectos.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Confirme su correo electrónico antes de iniciar sesión.";
  }
  return "No se pudo completar la operación. Intente nuevamente.";
}

export async function register(_prevState: AuthFormState | undefined, formData: FormData): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    pesoKg: formData.get("pesoKg"),
    alturaCm: formData.get("alturaCm"),
    rol: (formData.get("rol") as UserRol) ?? "alumno",
    deporteDocente: formData.get("deporteDocente"),
    deportes: formData.getAll("deportes"),
    tutorEmail: formData.get("tutorEmail"),
    termsAccepted: formData.get("termsAccepted") === "on",
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors, message: "Revise los campos indicados." };
  }

  const { name, email, password, pesoKg, alturaCm, rol, deporteDocente, deportes, tutorEmail } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, rol, deportes },
      emailRedirectTo: `${appUrl()}/auth/callback`,
    },
  });

  if (error) {
    return { message: authErrorMessage(error.message) };
  }

  if (data.user?.email) {
    const userId = data.user.id;
    await ensureUserProfile({
      id: userId,
      name,
      email: data.user.email,
      createdAt: data.user.created_at,
    });

    const deporteIds: string[] = [];
    for (const raw of deportes) {
      const deporte = raw.trim();
      if (!deporte) continue;
      const known = await ensureDeporte(deporte);
      deporteIds.push(known.id);
    }
    await setUserDeportes(userId, deporteIds);

    await updateProfile(userId, {
      pesoKg: pesoKg ?? null,
      alturaCm: alturaCm ?? null,
      rol,
      deporteDocente: rol === "profesor" ? (deporteDocente ?? null) : null,
      tutorEmail: rol === "alumno" && tutorEmail ? tutorEmail : null,
      termsAccepted: true,
    });

    if (rol === "alumno" && tutorEmail) {
      await linkTutor(userId, tutorEmail);
    }
  }

  if (!data.session) {
    return {
      success: true,
      message: "Cuenta creada. Revise su correo para confirmar el registro e iniciar sesión.",
    };
  }

  redirect("/app");
}

export async function login(_prevState: AuthFormState | undefined, formData: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors, message: "Revise los campos indicados." };
  }

  try {
    assertNotRateLimited(`login:${await clientIp()}`, 8, 5 * 60 * 1000);
  } catch (error) {
    return { message: error instanceof Error ? error.message : "Intente nuevamente más tarde." };
  }

  const { email, password } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user?.email) {
    return { message: authErrorMessage(error?.message ?? "invalid login") };
  }

  const name =
    typeof data.user.user_metadata?.name === "string" && data.user.user_metadata.name.trim()
      ? data.user.user_metadata.name.trim()
      : email.split("@")[0];

  await ensureUserProfile({
    id: data.user.id,
    name,
    email: data.user.email,
    createdAt: data.user.created_at,
  });

  redirect("/app");
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function forgotPassword(
  _prevState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors, message: "Revise los campos indicados." };
  }

  try {
    assertNotRateLimited(`forgot:${await clientIp()}`, 3, 15 * 60 * 1000);
  } catch (error) {
    return { message: error instanceof Error ? error.message : "Intente nuevamente más tarde." };
  }

  const { email } = parsed.data;
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl()}/auth/callback?next=/reset-password`,
  });

  return { message: "Si existe una cuenta con ese correo, recibirá un enlace para restablecer su contraseña." };
}

export async function resetPassword(
  _prevState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors, message: "Revise los campos indicados." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { message: "El enlace de restablecimiento no es válido o expiró. Solicite uno nuevo." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { message: authErrorMessage(error.message) };
  }

  redirect("/login?reset=success");
}
