import "server-only";
import { getClient } from "@/lib/db";
import { ensureUserProfile } from "@/lib/repo";
import type { UserRol } from "@/lib/schema";

export const DEMO_PASSWORD = "lente-demo-2026";

export const DEMO_USERS: Record<UserRol, { email: string; name: string }> = {
  profesor: { email: "admin.profesor@lente.dev", name: "Admin Profesor" },
  alumno: { email: "admin.alumno@lente.dev", name: "Admin Alumno" },
};

export function isDemoAdminEnabled(): boolean {
  return process.env.LENTE_DEMO_ADMIN === "1" || process.env.NODE_ENV !== "production";
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

/** Crea los dos usuarios demo (si no existen) y sus perfiles. Idempotente. */
export async function ensureDemoUsers(): Promise<void> {
  const admin = getClient();
  for (const { email, name } of Object.values(DEMO_USERS)) {
    const userId = await findAuthUserByEmail(email);
    if (userId) {
      await ensureUserProfile({
        id: userId,
        name,
        email,
        createdAt: new Date().toISOString(),
      });
      continue;
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { name },
    });
    if (error) throw new Error(`No se pudo crear el usuario demo ${email}: ${error.message}`);

    await ensureUserProfile({
      id: data.user.id,
      name,
      email,
      createdAt: data.user.created_at,
    });
  }
}