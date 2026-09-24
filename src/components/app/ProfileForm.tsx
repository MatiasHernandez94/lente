"use client";

import { useActionState, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { updateProfileAction } from "@/app/actions/profile";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { useScrollToError } from "@/lib/hooks/useScrollToError";
import type { Deporte } from "@/lib/profile/types";
import type { UserRol } from "@/lib/schema";

interface ProfileFormProps {
  deportes: Deporte[];
  defaultDeportes: string[];
  rol?: UserRol;
}

export function ProfileForm({ deportes, defaultDeportes, rol = "alumno" }: ProfileFormProps) {
  const [state, action, pending] = useActionState(updateProfileAction, undefined);
  const [selected, setSelected] = useState<string[]>(defaultDeportes);
  const [customSport, setCustomSport] = useState("");

  useScrollToError(Boolean(state?.errors));

  const destacados = deportes.filter((d) => d.destacado);
  const otros = deportes.filter((d) => !d.destacado);

  function toggleSport(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  function addCustomSport() {
    const name = customSport.trim();
    if (!name || selected.includes(name)) return;
    setSelected((prev) => [...prev, name]);
    setCustomSport("");
  }

  const error = (field: string) => state?.errors?.[field as keyof typeof state.errors]?.[0];

  return (
    <form action={action} className="space-y-5" noValidate>
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

      <h2 className="text-base font-medium text-ink">Editar mis datos</h2>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Peso (kg)">
          <TextInput name="pesoKg" type="number" inputMode="decimal" step="0.1" min={1} placeholder="Ej. 70" />
          {error("pesoKg") ? <p className="mt-1.5 text-xs text-red-900">{error("pesoKg")}</p> : null}
        </Field>
        <Field label="Altura (cm)">
          <TextInput name="alturaCm" type="number" inputMode="numeric" min={1} placeholder="Ej. 175" />
          {error("alturaCm") ? <p className="mt-1.5 text-xs text-red-900">{error("alturaCm")}</p> : null}
        </Field>
      </div>

      {rol === "profesor" ? (
        <Field label="¿Qué deporte enseña?" hint="Pádel, tenis, fútbol, etc.">
          <TextInput name="deporteDocente" placeholder="Ej. Pádel" list="deportes-catalogo-perfil" />
          <datalist id="deportes-catalogo-perfil">
            {deportes.map((d) => (
              <option key={d.id} value={d.nombre} />
            ))}
          </datalist>
          {error("deporteDocente") ? (
            <p className="mt-1.5 text-xs text-red-900">{error("deporteDocente")}</p>
          ) : null}
        </Field>
      ) : (
        <Field label="Profesor/a tutor (correo)" hint="Se vinculará si hay un perfil de profesor con ese correo.">
          <TextInput name="tutorEmail" type="email" placeholder="profe@club.com" />
          {error("tutorEmail") ? <p className="mt-1.5 text-xs text-red-900">{error("tutorEmail")}</p> : null}
        </Field>
      )}

      <div>
        <span className="label mb-2 block text-muted">Deportes que practica</span>
        <div className="flex flex-wrap gap-2">
          {destacados.map((deporte) => {
            const checked = selected.includes(deporte.id);
            return (
              <label key={deporte.id}>
                <input
                  type="checkbox"
                  name="deportes"
                  value={deporte.id}
                  className="sr-only"
                  checked={checked}
                  onChange={() => toggleSport(deporte.id)}
                />
                <span
                  className={`inline-block cursor-pointer border px-3.5 py-2 text-[13px] font-medium transition-colors ${
                    checked ? "border-ink bg-ink text-canvas" : "border-ink/15 text-ink hover:border-ink/40"
                  }`}
                >
                  {deporte.nombre}
                </span>
              </label>
            );
          })}
        </div>
        {otros.length > 0 ? (
          <details className="mt-2">
            <summary className="label cursor-pointer text-muted underline underline-offset-4">Ver más deportes</summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {otros.map((deporte) => {
                const checked = selected.includes(deporte.id);
                return (
                  <label key={deporte.id}>
                    <input
                      type="checkbox"
                      name="deportes"
                      value={deporte.id}
                      className="sr-only"
                      checked={checked}
                      onChange={() => toggleSport(deporte.id)}
                    />
                    <span
                      className={`inline-block cursor-pointer border px-3.5 py-2 text-[13px] font-medium transition-colors ${
                        checked ? "border-ink bg-ink text-canvas" : "border-ink/15 text-ink hover:border-ink/40"
                      }`}
                    >
                      {deporte.nombre}
                    </span>
                  </label>
                );
              })}
            </div>
          </details>
        ) : null}
        <div className="mt-3 flex gap-2">
          <TextInput
            value={customSport}
            onChange={(e) => setCustomSport(e.target.value)}
            placeholder="¿No está el tuyo? Escríbelo"
            aria-label="Agregar deporte personalizado"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomSport();
              }
            }}
          />
          <button
            type="button"
            onClick={addCustomSport}
            className="shrink-0 border border-ink/25 px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-surface"
          >
            Agregar
          </button>
        </div>
        {selected.filter((s) => !deportes.some((d) => d.id === s)).length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {selected
              .filter((s) => !deportes.some((d) => d.id === s))
              .map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-2 border border-ink bg-ink px-3.5 py-2 text-[13px] font-medium text-canvas"
                >
                  {s}
                  <input type="hidden" name="deportes" value={s} />
                  <button
                    type="button"
                    aria-label={`Quitar ${s}`}
                    className="text-canvas/80 hover:text-canvas"
                    onClick={() => toggleSport(s)}
                  >
                    ×
                  </button>
                </span>
              ))}
          </div>
        ) : null}
        {state?.errors?.deportes ? (
          <p className="mt-1.5 text-xs text-red-900">{state.errors.deportes[0]}</p>
        ) : null}
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Guardando…
          </span>
        ) : (
          "Guardar cambios"
        )}
      </Button>
    </form>
  );
}