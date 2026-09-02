"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import { register } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";

export function RegistroForm() {
  const [state, action, pending] = useActionState(register, undefined);

  return (
    <form action={action} className="space-y-5" noValidate>
      {state?.message && !state.errors ? (
        <p role="alert" className="border border-red-900/30 bg-red-50 px-3.5 py-2.5 text-sm text-red-900">
          {state.message}
        </p>
      ) : null}
      <Field label="Nombre">
        <TextInput
          name="name"
          autoComplete="name"
          placeholder="Nombre y apellido"
          aria-invalid={Boolean(state?.errors?.name)}
        />
        {state?.errors?.name ? <p className="mt-1.5 text-xs text-red-900">{state.errors.name[0]}</p> : null}
      </Field>
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
      <Field label="Contraseña" hint="Mínimo 8 caracteres, con una letra y un número.">
        <TextInput
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          aria-invalid={Boolean(state?.errors?.password)}
        />
        {state?.errors?.password ? (
          <ul className="mt-1.5 space-y-0.5 text-xs text-red-900">
            {state.errors.password.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Creando cuenta…
          </span>
        ) : (
          "Crear cuenta"
        )}
      </Button>
      <p className="pt-2 text-center text-sm text-muted">
        ¿Ya tiene una cuenta?{" "}
        <Link href="/login" className="font-medium text-ink underline underline-offset-4">
          Inicie sesión
        </Link>
      </p>
    </form>
  );
}