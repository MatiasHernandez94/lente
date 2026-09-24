"use client";

import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import { addCorreccion } from "@/app/actions/correccion";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { useScrollToError } from "@/lib/hooks/useScrollToError";

interface CorrectionFormProps {
  videoId: string;
  alumnoId: string;
}

export function CorrectionForm({ videoId, alumnoId }: CorrectionFormProps) {
  const [state, action, pending] = useActionState(addCorreccion, undefined);
  useScrollToError(Boolean(state?.errors));

  return (
    <form action={action} className="space-y-4" noValidate>
      {state?.message ? (
        <p
          role="alert"
          className={`border px-3.5 py-2.5 text-sm ${
            state.success
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-900/30 bg-red-50 text-red-900"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <input type="hidden" name="videoId" value={videoId} />
      <input type="hidden" name="alumnoId" value={alumnoId} />

      <Field label="Corrección" hint="Qué debe corregir la alumna o alumno (técnica, decisión, posición, etc.).">
        <textarea
          name="mensaje"
          rows={4}
          required
          aria-invalid={Boolean(state?.errors?.mensaje)}
          className="w-full border border-ink/15 border-solid bg-canvas px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-soft focus:border-ink"
          placeholder="Ej. Al minuto 2 el golpe de derecha queda corto; abre más la raqueta…"
        />
        {state?.errors?.mensaje ? (
          <p className="mt-1.5 text-xs text-red-900">{state.errors.mensaje[0]}</p>
        ) : null}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Minuto inicio" hint="Opcional">
          <TextInput name="minutoInicio" type="number" inputMode="numeric" min={0} placeholder="Ej. 2" />
          {state?.errors?.minutoInicio ? (
            <p className="mt-1.5 text-xs text-red-900">{state.errors.minutoInicio[0]}</p>
          ) : null}
        </Field>
        <Field label="Minuto fin" hint="Opcional">
          <TextInput name="minutoFin" type="number" inputMode="numeric" min={0} placeholder="Ej. 3" />
          {state?.errors?.minutoFin ? (
            <p className="mt-1.5 text-xs text-red-900">{state.errors.minutoFin[0]}</p>
          ) : null}
        </Field>
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Guardando…
          </span>
        ) : (
          "Guardar corrección"
        )}
      </Button>
    </form>
  );
}