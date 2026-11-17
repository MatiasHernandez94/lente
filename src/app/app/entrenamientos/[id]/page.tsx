import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Dumbbell, VideoOff } from "lucide-react";
import { CATEGORIES, getExercise } from "@/lib/training/catalog";
import { TrainingReference } from "@/components/app/TrainingReference";

export const metadata: Metadata = { title: "Ejercicio · Entrenamientos" };

export default async function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exercise = getExercise(id);
  if (!exercise) notFound();
  const category = CATEGORIES.find((item) => item.id === exercise.category);

  return (
    <div className="space-y-7">
      <Link href="/app/entrenamientos" className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"><ArrowLeft size={16} aria-hidden="true" /> Volver a ejercicios</Link>
      <header className="border-b border-hairline pb-7"><p className="label mb-3 text-muted">Baloncesto · {category?.label}</p><h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{exercise.name}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{exercise.goal}</p></header>
      <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-7">
          <TrainingReference exerciseId={exercise.id} exerciseName={exercise.name} />
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 border border-hairline bg-surface px-6 text-center"><VideoOff size={28} strokeWidth={1.5} className="text-soft" aria-hidden="true" /><p className="text-sm font-medium text-ink">Video de demostración pendiente</p><p className="max-w-sm text-xs leading-5 text-muted">La cápsula se incorporará después de validar que la demostración sea técnicamente correcta.</p></div>
          <section><h2 className="text-lg font-semibold text-ink">Cómo hacerlo</h2><ol className="mt-4 space-y-4">{exercise.steps.map((step, index) => <li key={step} className="flex gap-4 text-sm leading-6 text-muted"><span className="table-num text-sm font-semibold text-ink">{String(index + 1).padStart(2, "0")}</span><span>{step}</span></li>)}</ol></section>
          <section><h2 className="text-lg font-semibold text-ink">Puntos a cuidar</h2><ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-muted">{exercise.cues.map((cue) => <li key={cue}>{cue}</li>)}</ul></section>
        </div>
        <aside className="space-y-5">
          <div className="border border-hairline bg-surface p-5"><p className="label mb-3 text-muted">Equipamiento</p><p className="flex items-center gap-2 text-sm font-medium text-ink"><Dumbbell size={16} aria-hidden="true" />{exercise.equipment}</p></div>
          <div className="border border-hairline bg-canvas p-5"><p className="label mb-3 text-muted">Series y repeticiones</p><p className="text-sm leading-6 text-ink">{exercise.dosage}</p><p className="mt-3 text-xs leading-5 text-muted">No es una prescripción personalizada. Ajustá cargas, volumen y descanso con un profesional según tu experiencia y condición.</p></div>
          <div className="border border-amber-800/25 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><p className="font-semibold">Antes de empezar</p><p className="mt-2">Contenido revisado por un personal trainer. {exercise.caution} Frená si aparece dolor y consultá a un profesional ante lesiones o dudas.</p></div>
          <p className="text-xs leading-5 text-soft">El análisis de tu ejecución para este ejercicio todavía no está disponible.</p>
        </aside>
      </div>
    </div>
  );
}
