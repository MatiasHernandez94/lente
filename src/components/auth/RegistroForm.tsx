"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { register } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import type { Deporte } from "@/lib/profile/types";
import type { UserRol } from "@/lib/schema";

export function RegistroForm({ deportes }: { deportes: Deporte[] }) {
  const [state, action, pending] = useActionState(register, undefined);
  const [rol, setRol] = useState<UserRol>("alumno");
  const [selected, setSelected] = useState<string[]>([]);
  const [customSport, setCustomSport] = useState("");

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
      {state?.message && !state.errors ? (
        <p
          role="alert"
          className={
            state.success
              ? "border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-800"
              : "border border-red-900/30 bg-red-50 px-3.5 py-2.5 text-sm text-red-900"
          }
        >
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
        {error("name") ? <p className="mt-1.5 text-xs text-red-900">{error("name")}</p> : null}
      </Field>

      <Field label="Correo electrónico">
        <TextInput
          name="email"
          type="email"
          autoComplete="email"
          placeholder="nombre@club.com"
          aria-invalid={Boolean(state?.errors?.email)}
        />
        {error("email") ? <p className="mt-1.5 text-xs text-red-900">{error("email")}</p> : null}
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

      <div>
        <span className="label mb-2 block text-muted">Datos básicos</span>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Peso (kg)">
            <TextInput
              name="pesoKg"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={1}
              placeholder="Ej. 70"
              aria-invalid={Boolean(state?.errors?.pesoKg)}
            />
            {error("pesoKg") ? <p className="mt-1.5 text-xs text-red-900">{error("pesoKg")}</p> : null}
          </Field>
          <Field label="Altura (cm)">
            <TextInput
              name="alturaCm"
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="Ej. 175"
              aria-invalid={Boolean(state?.errors?.alturaCm)}
            />
            {error("alturaCm") ? <p className="mt-1.5 text-xs text-red-900">{error("alturaCm")}</p> : null}
          </Field>
        </div>
      </div>

      <div>
        <span className="label mb-2 block text-muted">Soy</span>
        <div className="grid grid-cols-2 gap-3">
          {(["alumno", "profesor"] as const).map((value) => (
            <label
              key={value}
              className={`cursor-pointer border px-4 py-3 transition-colors ${
                rol === value ? "border-ink bg-surface" : "border-ink/15 hover:border-ink/40"
              }`}
            >
              <input
                type="radio"
                name="rol"
                value={value}
                className="sr-only"
                checked={rol === value}
                onChange={() => setRol(value)}
              />
              <span className="block text-sm font-medium text-ink">
                {value === "alumno" ? "Soy alumno/a" : "Soy profesor/a"}
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                {value === "alumno" ? "Analizo y mejoro mi juego" : "Corrijo y hago seguimiento"}
              </span>
            </label>
          ))}
        </div>
        {error("rol") ? <p className="mt-1.5 text-xs text-red-900">{error("rol")}</p> : null}
      </div>

      {rol === "profesor" ? (
        <Field label="¿Qué deporte enseña?" hint="Pádel, tenis, fútbol, etc.">
          <TextInput
            name="deporteDocente"
            placeholder="Ej. Pádel"
            list="deportes-catalogo"
            aria-invalid={Boolean(state?.errors?.deporteDocente)}
          />
          <datalist id="deportes-catalogo">
            {deportes.map((d) => (
              <option key={d.id} value={d.nombre} />
            ))}
          </datalist>
          {error("deporteDocente") ? (
            <p className="mt-1.5 text-xs text-red-900">{error("deporteDocente")}</p>
          ) : null}
        </Field>
      ) : (
        <Field label="Profesor/a tutor (opcional)" hint="Correo de quien te entrena o dirige.">
          <TextInput
            name="tutorEmail"
            type="email"
            autoComplete="email"
            placeholder="profe@club.com"
            aria-invalid={Boolean(state?.errors?.tutorEmail)}
          />
          {error("tutorEmail") ? <p className="mt-1.5 text-xs text-red-900">{error("tutorEmail")}</p> : null}
        </Field>
      )}

      <div>
        <span className="label mb-2 block text-muted">Deportes que practica</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Deportes que practica">
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
            <summary className="label cursor-pointer text-muted underline underline-offset-4">
              Ver más deportes
            </summary>
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
        {selected.filter((s) => s !== deportes.find((d) => d.id === s)?.id).length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {selected
              .filter((s) => !deportes.some((d) => d.id === s))
              .map((s) => (
                <span key={s} className="inline-flex items-center gap-2 border border-ink bg-ink px-3.5 py-2 text-[13px] font-medium text-canvas">
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

      <label className="flex items-start gap-3 border border-ink/15 px-3.5 py-3">
        <input
          type="checkbox"
          name="termsAccepted"
          className="mt-0.5 size-4 accent-ink"
          aria-invalid={Boolean(state?.errors?.termsAccepted)}
        />
        <span className="text-[13px] leading-5 text-muted">
          Acepto los{" "}
          <Link href="/terminos" className="font-medium text-ink underline underline-offset-4">
            términos y condiciones
          </Link>{" "}
          y la política de privacidad.
        </span>
      </label>
      {state?.errors?.termsAccepted ? (
        <p className="-mt-2 text-xs text-red-900">{state.errors.termsAccepted[0]}</p>
      ) : null}

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