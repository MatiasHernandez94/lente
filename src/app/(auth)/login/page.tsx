import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return (
    <section className="w-full max-w-md border border-hairline bg-canvas px-8 py-10 sm:px-10">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Bienvenido de nuevo</h1>
      <p className="mt-1.5 mb-8 text-sm leading-6 text-muted">
        Ingrese sus credenciales para acceder al panel de análisis.
      </p>
      <LoginForm />
    </section>
  );
}