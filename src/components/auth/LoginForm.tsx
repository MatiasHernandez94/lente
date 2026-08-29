"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="space-y-5" noValidate>
      {state?.message && !state.errors ? (
        <p role="alert" className="border border-red-900/30 bg-red-50 px-3.5 py-2.5 text-sm text-red-900">
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
        {state?.errors?.email ? <p className="mt-1.5 text-xs text-red-900">{state.errors.email[0]}</p> : null}
      </Field>
      <Field label="Contraseña">
        <TextInput
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          aria-invalid={Boolean(state?.errors?.password)}
        />
        {state?.errors?.password ? <p className="mt-1.5 text-xs text-red-900">{state.errors.password[0]}</p> : null}
      </Field>
      {state?.errors?.form ? <p role="alert" className="text-sm text-red-900">{state.errors.form[0]}</p> : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Ingresando…" : "Ingresar"}
      </Button>
      <p className="pt-2 text-center text-sm text-muted">
        ¿No tiene una cuenta?{" "}
        <Link href="/registro" className="font-medium text-ink underline underline-offset-4">
          Regístrese
        </Link>
      </p>
    </form>
  );
}