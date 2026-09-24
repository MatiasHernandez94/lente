import "server-only";
import { randomUUID } from "node:crypto";
import { getClient } from "@/lib/db";
import { ensureUserProfile, getUserById } from "@/lib/repo";
import { updateProfile } from "@/lib/profile/service";
import type { UserRol } from "@/lib/schema";

export const DEMO_ADMIN_EMAIL = "admin@lente.dev";
const DEMO_PASSWORD_PREFIX = "demo-";

export function isDemoAdminEnabled(): boolean {
  return process.env.LENTE_DEMO_ADMIN === "1" || process.env.NODE_ENV !== "production";
}

export function demoAdminEmail(): string {
  return process.env.LENTE_DEMO_ADMIN_EMAIL?.trim() || DEMO_ADMIN_EMAIL;
}

export async function isDemoAdminUser(email: string): Promise<boolean> {
  return isDemoAdminEnabled() && email.toLowerCase() === demoAdminEmail().toLowerCase();
}

async function findAuthUserByEmail(email: string): Promise<string | null> {
  const admin = getClient();
  let page = 1;
  while (page <= 100) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`No se pudo listar usuarios demo: ${error.message}`);
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < 1000) break;
    page += 1;
  }
  return null;
}

export async function ensureDemoUser(rol: UserRol): Promise<string> {
  const admin = getClient();
  const email = demoAdminEmail();
  const authId = await findAuthUserByEmail(email);

  let userId = authId;
  if (!userId) {
    const password = `${DEMO_PASSWORD_PREFIX}${randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: "Administrador Lente" },
    });
    if (error) throw new Error(`No se pudo crear el usuario demo: ${error.message}`);
    userId = data.user.id;
  }

  await ensureUserProfile({
    id: userId,
    name: "Administrador Lente",
    email,
    createdAt: new Date().toISOString(),
  });

  const profile = await getUserById(userId);
  await updateProfile(userId, {
    rol,
    deporteDocente: rol === "profesor" ? profile?.deporteDocente ?? "Fútbol" : null,
    termsAccepted: true,
  });
  return userId;
}