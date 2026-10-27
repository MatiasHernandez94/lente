"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { login } from "@/app/actions/auth";
import { enterDemoAlumno, enterDemoProfesor } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";

export function LoginForm({ demoAdmin = false }: { demoAdmin?: boolean }) {
  const [state, action, pending] = useActionState(login, undefined);
  const [demoProfesorState, demoProfesorAction, demoProfesorPending] = useActionState(enterDemoProfesor, undefined);
  const [demoAlumnoState, demoAlumnoAction, demoAlumnoPending] = useActionState(enterDemoAlumno, undefined);

  const demoMessage =
    (demoProfesorState?.success === false ? demoProfesorState.message : undefined) ??
    (demoAlumnoState?.success === false ? demoAlumnoState.message : undefined);
  const demoPending = demoProfesorPending || demoAlumnoPending;

  return (
    <>
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
      </form>
      {demoAdmin ? (
        <div className="mt-5 space-y-2 border-t border-hairline pt-4">
          {demoMessage ? (
            <p role="alert" className="border border-red-900/30 bg-red-50 px-3 py-2 text-xs text-red-900">
              {demoMessage}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <form action={demoProfesorAction}>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={demoPending}
                title="Entrar como administrador de demostración sin contraseña"
              >
                {demoProfesorPending ? (
                  <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
                ) : (
                  <ShieldCheck size={13} aria-hidden="true" />
                )}
                Admin · Profesor
              </Button>
            </form>
            <form action={demoAlumnoAction}>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={demoPending}
                title="Entrar como administrador de demostración (perfil alumno) sin contraseña"
              >
                {demoAlumnoPending ? (
                  <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
                ) : (
                  <ShieldCheck size={13} aria-hidden="true" />
                )}
                Admin · Alumno
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
