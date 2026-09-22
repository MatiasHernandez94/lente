"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LoaderCircle, ArrowLeft } from "lucide-react";
import { forgotPassword } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPassword, undefined);

  return (
    <form action={action} className="space-y-5" noValidate>
      {state?.message ? (
        <p
          role="alert"
          className="border border-hairline bg-surface px-3.5 py-2.5 text-sm text-ink"
        >
          {state.message}
        </p>
      ) : null}
      <Field label="Correo electrónico">
        <TextInput
          name="email"
          type="email"
          autoComplete="email"
          placeholder="nombre@club.com"
          aria-invalid={Boolean(state?.errors?.email)}
        />
        {state?.errors?.email ? (
          <p className="mt-1.5 text-xs text-red-900">{state.errors.email[0]}</p>
        ) : null}
      </Field>
      {state?.errors?.form ? (
        <p role="alert" className="text-sm text-red-900">{state.errors.form[0]}</p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Enviando…
          </span>
        ) : (
          "Enviar enlace de restablecimiento"
        )}
      </Button>
      <p className="pt-2 text-center text-sm text-muted">
        <Link href="/login" className="inline-flex items-center gap-1 font-medium text-ink underline underline-offset-4">
          <ArrowLeft size={12} />
          Volver al inicio de sesión
        </Link>
      </p>
    </form>
  );
}
