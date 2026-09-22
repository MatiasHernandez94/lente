import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = { title: "Iniciar sesión" };

interface Props {
  searchParams: Promise<{ reset?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { reset } = await searchParams;

  return (
    <section className="w-full max-w-md border border-hairline bg-canvas px-8 py-10 sm:px-10">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Bienvenido de nuevo</h1>
      <p className="mt-1.5 mb-8 text-sm leading-6 text-muted">
        Ingrese sus credenciales para acceder al panel de análisis.
      </p>
      {reset === "success" ? (
        <p className="mb-5 border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-800">
          Tu contraseña fue restablecida correctamente. Ahora podés iniciar sesión.
        </p>
      ) : null}
      <LoginForm />
    </section>
  );
}