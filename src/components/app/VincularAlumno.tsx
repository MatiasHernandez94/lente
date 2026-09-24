"use client";

import { useEffect, useRef } from "react";
import { useActionState } from "react";
import { LoaderCircle, UserPlus } from "lucide-react";
import { vincularAlumno, type VincularAlumnoState } from "@/app/actions/profesor";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";

export function VincularAlumnoButton() {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [state, action, pending] = useActionState<VincularAlumnoState, FormData>(
    vincularAlumno,
    { errors: undefined, message: undefined, success: false },
  );

  useEffect(() => {
    if (state?.message && !state.errors) {
      dialogRef.current?.close();
    }
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex items-center gap-2 bg-ink px-5 py-2.5 text-sm font-medium text-canvas transition-colors hover:bg-muted"
      >
        <UserPlus size={15} strokeWidth={2} aria-hidden="true" /> Vincular alumno/a
      </button>

      <dialog
        ref={dialogRef}
        onCancel={(e) => e.preventDefault()}
        className="m-auto w-full max-w-md border border-hairline bg-canvas p-0 backdrop:bg-ink/40 open:block"
      >
        <form action={action} className="space-y-5 p-6" noValidate>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-ink">Vincular alumno/a</h2>
              <p className="mt-1 text-[13px] leading-5 text-muted">
                Al vincular, pasás directamente a cargar el video de su análisis.
              </p>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Cerrar"
              className="cursor-pointer px-2 py-0.5 text-lg leading-none text-muted hover:text-ink"
            >
              ×
            </button>
          </div>

          {state?.message && !state.errors ? (
            <p role="alert" className="border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-800">
              {state.message}
            </p>
          ) : null}
          {state?.errors?.form ? (
            <p role="alert" className="border border-red-900/30 bg-red-50 px-3.5 py-2.5 text-sm text-red-900">
              {state.errors.form}
            </p>
          ) : null}

          <Field label="Nombre del alumno/a">
            <TextInput
              name="name"
              autoComplete="off"
              placeholder="Nombre y apellido"
              aria-invalid={Boolean(state?.errors?.name)}
            />
            {state?.errors?.name ? <p className="mt-1.5 text-xs text-red-900">{state.errors.name[0]}</p> : null}
          </Field>

          <Field label="Correo electrónico" hint="Opcional, necesario si querés que el alumno/a tenga su propia cuenta.">
            <TextInput
              name="email"
              type="email"
              autoComplete="off"
              placeholder="opcional@club.com"
              aria-invalid={Boolean(state?.errors?.email)}
            />
            {state?.errors?.email ? <p className="mt-1.5 text-xs text-red-900">{state.errors.email[0]}</p> : null}
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => dialogRef.current?.close()}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> Vinculando…
                </span>
              ) : (
                "Vincular y cargar video"
              )}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}