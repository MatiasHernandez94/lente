import type { Metadata } from "next";
import Link from "next/link";
import { BeginnerRoutine } from "@/components/app/BeginnerRoutine";
import { EXERCISES } from "@/lib/training/catalog";

export const metadata: Metadata = { title: "Guía de entrenamiento" };

export default function GuidedTrainingPage() {
  return (
    <div className="space-y-6">
      <Link href="/app/entrenamientos" className="text-sm text-muted underline">Volver a la biblioteca</Link>
      <header><p className="label mb-3 text-muted">Entrenamiento · Básquet</p><h1 className="text-3xl font-semibold text-ink">Tu guía paso a paso</h1></header>
      <aside className="border border-amber-800/25 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><strong>Rutina orientativa revisada por un personal trainer.</strong> No es una prescripción personalizada. Consultá a un profesional para elegir ejercicios, cargas, series y descansos, especialmente si tenés lesiones o dudas. Frená si aparece dolor.</aside>
      <BeginnerRoutine exercises={EXERCISES} />
    </div>
  );
}
