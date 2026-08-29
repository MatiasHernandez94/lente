import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser } from "./session";
import type { UserRow } from "./schema";
import { ApiServiceError } from "./services/videoService";

export async function requireApiUser(): Promise<UserRow> {
  const user = await getSessionUser();
  if (!user) {
    throw new ApiServiceError(401, "Su sesión expiró. Inicie sesión para continuar.");
  }
  return user;
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("host");
  try {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      throw new ApiServiceError(403, "Origen de solicitud no válido.");
    }
  } catch (error) {
    if (error instanceof ApiServiceError) throw error;
    throw new ApiServiceError(403, "Origen de solicitud no válido.");
  }
}

export function serializeError(error: unknown): NextResponse {
  if (error instanceof ApiServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  if (error instanceof Error) {
    console.error("[api] error:", error.message);
  }
  return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
}