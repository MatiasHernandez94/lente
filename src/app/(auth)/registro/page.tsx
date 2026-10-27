import type { Metadata } from "next";
import { RegistroForm } from "@/components/auth/RegistroForm";
import { listDeportes } from "@/lib/profile/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function RegistroPage() {
  const deportes = await listDeportes();

  return (
    <section className="w-full max-w-xl border border-hairline bg-canvas px-8 py-10 sm:px-10">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Crear una cuenta</h1>
      <p className="mt-1.5 mb-8 text-sm leading-6 text-muted">
        Cuéntenos sobre usted y empiece a analizar video deportivo con Inteligencia Artificial.
      </p>
      <RegistroForm deportes={deportes} />
    </section>
  );
}