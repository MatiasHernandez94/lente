import { NextResponse } from "next/server";
import { requireApiUser, serializeError } from "@/lib/api";
import { listHilosPendientesProfesor } from "@/lib/consulta/service";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    if (user.rol !== "profesor") {
      return NextResponse.json({ error: "Prohibido" }, { status: 403 });
    }
    const hilos = await listHilosPendientesProfesor(user.id);
    return NextResponse.json({ hilos });
  } catch (error) {
    return serializeError(error);
  }
}
