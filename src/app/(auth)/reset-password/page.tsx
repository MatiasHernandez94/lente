import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = { title: "Restablecer contraseña" };

export default function ResetPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Nueva contraseña</h1>
        <p className="text-sm text-muted">Ingresá tu nueva contraseña a continuación.</p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
