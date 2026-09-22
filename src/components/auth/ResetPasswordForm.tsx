"use client";

import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import { resetPassword } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPassword, undefined);

  return (
    <form action={action} className="space-y-5" noValidate>
      {state?.message ? (
        <p
          role="alert"
          className="border border-red-900/30 bg-red-50 px-3.5 py-2.5 text-sm text-red-900"
        >
          {state.message}
        </p>
      ) : null}
      <Field label="Nueva contraseña">
        <TextInput
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          aria-invalid={Boolean(state?.errors?.password)}
        />
        {state?.errors?.password ? (
          <p className="mt-1.5 text-xs text-red-900">{state.errors.password[0]}</p>
        ) : null}
      </Field>
      {state?.errors?.form ? (
        <p role="alert" className="text-sm text-red-900">{state.errors.form[0]}</p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Guardando…
          </span>
        ) : (
          "Restablecer contraseña"
        )}
      </Button>
    </form>
  );
}
