"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { createSession, deleteSession } from "@/lib/session";
import { findUserByEmail, createUser } from "@/lib/repo";
import { loginSchema, registerSchema } from "@/lib/validation";
import { assertNotRateLimited } from "@/lib/rateLimit";

export interface AuthFormState {
  errors?: {
    name?: string[];
    email?: string[];
    password?: string[];
    form?: string;
  };
  message?: string;
}

async function clientIp(): Promise<string> {
  const list = (await headers()).get("x-forwarded-for")?.split(",");
  return list?.[0]?.trim() || "local";
}

export async function register(_prevState: AuthFormState | undefined, formData: FormData): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors, message: "Revise los campos indicados." };
  }

  const { name, email, password } = parsed.data;

  if (findUserByEmail(email)) {
    return { message: "Ya existe una cuenta con ese correo." };
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  createUser({
    id: randomUUID(),
    name,
    email,
    passwordHash,
    createdAt: new Date().toISOString(),
  });

  const user = findUserByEmail(email);
  if (user) {
    await createSession(user.id);
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
  const user = findUserByEmail(email);

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return { message: "Correo o contraseña incorrectos." };
  }

  await createSession(user.id);
  redirect("/app");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}