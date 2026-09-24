"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { login } from "@/app/actions/auth";
import { enterDemoAdmin } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";

export function LoginForm({ demoAdmin = false }: { demoAdmin?: boolean }) {
  const [state, action, pending] = useActionState(login, undefined);
  const [demoState, demoAction, demoPending] = useActionState(enterDemoAdmin, undefined);

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
      <div className="flex items-center justify-end">
        <Link href="/forgot-password" className="text-xs text-muted hover:text-ink underline underline-offset-4">
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
      {state?.errors?.form ? <p role="alert" className="text-sm text-red-900">{state.errors.form[0]}</p> : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Ingresando…
          </span>
        ) : (
          "Ingresar"
        )}
      </Button>
      <p className="pt-2 text-center text-sm text-muted">
        ¿No tiene una cuenta?{" "}
        <Link href="/registro" className="font-medium text-ink underline underline-offset-4">
          Regístrese
        </Link>
      </p>
      {demoAdmin ? (
        <div className="space-y-2 border-t border-hairline pt-4">
          {demoState?.message && !demoState.success ? (
            <p role="alert" className="border border-red-900/30 bg-red-50 px-3 py-2 text-xs text-red-900">
              {demoState.message}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="submit"
              formAction={demoAction}
              name="rol"
              value="profesor"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={demoPending}
              title="Entrar como administrador de demostración sin contraseña"
            >
              {demoPending ? (
                <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck size={13} aria-hidden="true" />
              )}
              Admin · Profesor
            </Button>
            <Button
              type="submit"
              formAction={demoAction}
              name="rol"
              value="alumno"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={demoPending}
              title="Entrar como administrador de demostración (perfil alumno) sin contraseña"
            >
              {demoPending ? (
                <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck size={13} aria-hidden="true" />
              )}
              Admin · Alumno
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}