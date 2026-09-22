import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Olvidé mi contraseña" };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Olvidé mi contraseña</h1>
        <p className="text-sm text-muted">
          Ingresá tu correo y te enviaremos un enlace para restablecer tu contraseña.
        </p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
