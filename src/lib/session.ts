import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ensureUserProfile, getUserById } from "./repo";
import type { UserRow } from "./schema";

function displayNameFromAuth(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): string {
  const metaName = user.user_metadata?.name;
  if (typeof metaName === "string" && metaName.trim()) return metaName.trim();
  return user.email?.split("@")[0] ?? "Usuario";
}

export async function getSessionUser(): Promise<UserRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const name = displayNameFromAuth(user);
  await ensureUserProfile({
    id: user.id,
    name,
    email: user.email,
    createdAt: user.created_at,
  });

  const profile = await getUserById(user.id);
  if (profile) return profile;

  return {
    id: user.id,
    name,
    email: user.email,
    createdAt: user.created_at,
    pesoKg: null,
    alturaCm: null,
    rol: "alumno",
    deporteDocente: null,
    tutorEmail: null,
    termsAccepted: false,
    termsAcceptedAt: null,
  };
}
