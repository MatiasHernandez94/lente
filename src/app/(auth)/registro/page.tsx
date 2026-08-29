import type { Metadata } from "next";
import { RegistroForm } from "@/components/auth/RegistroForm";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function RegistroPage() {
  return (
    <section className="w-full max-w-md border border-hairline bg-canvas px-8 py-10 sm:px-10">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Crear una cuenta</h1>
      <p className="mt-1.5 mb-8 text-sm leading-6 text-muted">
        Comience a analizar videos de fútbol, pádel, voleibol y baloncesto.
      </p>
      <RegistroForm />
    </section>
  );
}