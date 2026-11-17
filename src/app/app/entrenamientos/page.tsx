import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Dumbbell, Search } from "lucide-react";
import { CATEGORIES, EXERCISES, filterExercises } from "@/lib/training/catalog";

export const metadata: Metadata = { title: "Entrenamientos" };

interface PageProps {
  searchParams: Promise<{ categoria?: string | string[]; q?: string | string[] }>;
}

export default async function TrainingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const category = typeof params.categoria === "string" ? params.categoria : "";
  const query = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const exercises = filterExercises({ category, query });

  return (
    <div className="space-y-9">
      <header className="border-b border-hairline pb-8">
        <p className="label mb-3 text-muted">Entrenamiento · Baloncesto</p>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Entrená para tu juego.</h1>
            <p className="mt-3 text-sm leading-6 text-muted">Una biblioteca inicial de preparación física para adultos que juegan básquet y quieren competir mejor.</p>
          </div>
          <div className="border-l-2 border-ink pl-4"><span className="table-num text-3xl font-semibold text-ink">{String(EXERCISES.length).padStart(2, "0")}</span><p className="label mt-1 text-muted">Ejercicios iniciales</p></div>
        </div>
      </header>

      <aside className="border border-amber-800/25 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
        <strong>Contenido orientativo revisado por un personal trainer.</strong> Las series no son un plan personalizado. Si tenés lesiones, dolor o dudas sobre las cargas, consultá a un profesional; frená si aparece dolor.
      </aside>

      <section className="flex flex-wrap items-center justify-between gap-4 border border-hairline bg-surface p-5"><div><h2 className="text-lg font-semibold text-ink">Rutina inicial guiada</h2><p className="mt-1 text-sm text-muted">Conocé una sesión orientativa para principiantes, con ejercicios y descansos en orden.</p></div><Link href="/app/entrenamientos/guia" className="bg-ink px-5 py-3 text-sm font-medium text-canvas">Ver rutina inicial</Link></section>

      <section aria-labelledby="biblioteca-title" className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="label mb-2 text-soft">Biblioteca · Gimnasio</p><h2 id="biblioteca-title" className="text-xl font-semibold text-ink">Elegí qué querés trabajar</h2></div>
          <p className="text-xs text-muted">{exercises.length} {exercises.length === 1 ? "ejercicio" : "ejercicios"}</p>
        </div>
        <form action="/app/entrenamientos" className="flex flex-wrap gap-2">
          <label htmlFor="exercise-search" className="sr-only">Buscar ejercicio o equipamiento</label>
          <div className="flex min-w-[220px] flex-1 items-center gap-2 border border-hairline bg-canvas px-3"><Search size={16} aria-hidden="true" className="text-muted" /><input id="exercise-search" name="q" defaultValue={query} placeholder="Buscar ejercicio o equipamiento" className="w-full bg-transparent py-3 text-sm text-ink outline-none" /></div>
          <label htmlFor="exercise-category" className="sr-only">Categoría</label>
          <select id="exercise-category" name="categoria" defaultValue={category} className="border border-hairline bg-canvas px-3 py-3 text-sm text-ink"><option value="">Todas las categorías</option>{CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          <button type="submit" className="bg-ink px-5 py-3 text-sm font-medium text-canvas hover:bg-muted">Buscar</button>
        </form>
        {exercises.length === 0 ? <div className="border border-hairline bg-surface px-5 py-10 text-sm text-muted">No encontramos ejercicios con esos filtros. <Link href="/app/entrenamientos" className="font-medium text-ink underline">Ver todos</Link></div> : (
          <div className="grid gap-px border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
            {exercises.map((exercise, index) => (
              <Link key={exercise.id} href={`/app/entrenamientos/${exercise.id}`} className="group flex min-h-52 flex-col justify-between gap-6 bg-canvas p-5 transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ink">
                <div><div className="flex items-center justify-between"><span className="label text-soft">{CATEGORIES.find((item) => item.id === exercise.category)?.label}</span><span className="table-num text-sm text-soft">{String(index + 1).padStart(2, "0")}</span></div><h3 className="mt-4 text-lg font-semibold text-ink group-hover:underline">{exercise.name}</h3><p className="mt-2 text-sm leading-6 text-muted">{exercise.goal}</p></div>
                <div className="flex items-end justify-between gap-3"><span className="flex items-center gap-2 text-xs text-soft"><Dumbbell size={15} aria-hidden="true" />{exercise.equipment}</span><ArrowRight size={18} aria-hidden="true" className="shrink-0 text-ink" /></div>
              </Link>
            ))}
          </div>
        )}
      </section>
      <p className="text-xs leading-5 text-soft">Las cápsulas de video y la evaluación de ejecución todavía no están disponibles. Vamos a incorporarlas después de validar la técnica y el contenido.</p>
    </div>
  );
}
