"use client";

import { useEffect, useState } from "react";
import type { Exercise } from "@/lib/training/catalog";
import { BEGINNER_ROUTINE, feedbackMessage, type Effort } from "@/lib/training/routine";
import { remainingSeconds } from "@/lib/training/session";
import { TrainingReference } from "@/components/app/TrainingReference";

interface BeginnerRoutineProps {
  exercises: readonly Exercise[];
}

export function BeginnerRoutine({ exercises }: BeginnerRoutineProps) {
  const [stage, setStage] = useState<"intro" | "exercise" | "feedback" | "result">("intro");
  const [index, setIndex] = useState(0);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [effort, setEffort] = useState<Effort | "">("");
  const [pain, setPain] = useState<"si" | "no" | "">("");
  const [stoppedEarly, setStoppedEarly] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const step = BEGINNER_ROUTINE[index];
  const exercise = exercises.find((item) => item.id === step?.exerciseId);
  const isComplete = BEGINNER_ROUTINE.every((item) => exercises.some((exercise) => exercise.id === item.exerciseId));

  useEffect(() => {
    if (endTime === null) return;
    const timer = window.setInterval(() => {
      const remaining = remainingSeconds(endTime, Date.now());
      setSeconds(remaining);
      if (remaining === 0) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [endTime]);

  function reset() {
    setStage("intro"); setIndex(0); setEndTime(null); setEffort(""); setPain(""); setStoppedEarly(false); setReviewed(false);
  }

  if (!isComplete) return <p role="alert" className="border border-amber-800/25 bg-amber-50 p-5 text-sm text-amber-950">La rutina no está disponible: falta una ficha. No se puede iniciar hasta corregirla.</p>;

  if (stage === "intro") return (
    <section className="space-y-5 border border-hairline bg-surface p-5 sm:p-6">
      <div><p className="label text-muted">Borrador · Principiantes</p><h2 className="mt-2 text-xl font-semibold text-ink">Tu primera sesión de preparación física</h2><p className="mt-2 text-sm leading-6 text-muted">Propuesta para revisar con un profesional si entrenás dos o tres días por semana. No es una rutina personalizada ni una indicación de frecuencia para vos.</p></div>
      <ol className="space-y-2 text-sm text-ink">{BEGINNER_ROUTINE.map((item) => <li key={item.exerciseId}><strong>{item.phase}:</strong> {exercises.find((candidate) => candidate.id === item.exerciseId)?.name}</li>)}</ol>
      <p className="text-sm leading-6 text-amber-950">Si tenés dolor, lesiones, alguna condición de salud o dudas sobre tu aptitud para entrenar, consultá a un profesional antes de comenzar. Este ejemplo aún no fue revisado profesionalmente.</p>
      <label className="flex items-start gap-3 text-sm text-ink"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} className="mt-1" />Entiendo que es un borrador y que debo revisar ejercicios, volumen, cargas y descansos con un profesional antes de entrenar.</label>
      <button type="button" disabled={!reviewed} onClick={() => setStage("exercise")} className="bg-ink px-5 py-3 text-sm font-medium text-canvas disabled:opacity-40">Explorar la sesión</button>
    </section>
  );

  if (stage === "feedback" || stage === "result") return (
    <section className="space-y-5 border border-hairline bg-surface p-5 sm:p-6">
      <h2 className="text-xl font-semibold text-ink">{stoppedEarly ? "Interrumpiste la sesión" : "Terminaste el recorrido"}</h2>
      {stage === "feedback" ? <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); if (effort && pain) setStage("result"); }}>
        <fieldset><legend className="mb-2 font-medium text-ink">¿Cómo sentiste el esfuerzo?</legend><div className="flex flex-wrap gap-4">{([ ["facil", "Fácil"], ["moderado", "Moderado"], ["dificil", "Difícil"] ] as const).map(([value, label]) => <label key={value} className="flex gap-2 text-sm text-ink"><input type="radio" name="effort" value={value} required checked={effort === value} onChange={() => setEffort(value)} />{label}</label>)}</div></fieldset>
        <fieldset><legend className="mb-2 font-medium text-ink">¿Sentiste dolor durante la sesión?</legend><div className="flex gap-4">{([ ["si", "Sí"], ["no", "No"] ] as const).map(([value, label]) => <label key={value} className="flex gap-2 text-sm text-ink"><input type="radio" name="pain" value={value} required checked={pain === value} onChange={() => setPain(value)} />{label}</label>)}</div></fieldset>
        <p className="text-xs text-muted">Tus respuestas solo se muestran en esta pantalla: no se guardan ni ajustan sesiones futuras.</p><button type="submit" className="bg-ink px-5 py-3 text-sm text-canvas">Ver orientación</button>
      </form> : <><p role="status" className="text-sm leading-6 text-ink">{feedbackMessage(effort || null, pain === "si")}</p><p className="text-xs text-muted">La respuesta y el progreso no se guardan; no hay ajustes automáticos ni seguimiento entre sesiones.</p><button type="button" onClick={reset} className="border border-ink px-5 py-3 text-sm text-ink">Volver al inicio</button></>}
    </section>
  );

  if (!exercise || !step) return <p role="alert">No se pudo cargar el ejercicio.</p>;

  return (
    <section className="space-y-5 border border-hairline bg-surface p-5 sm:p-6">
      <p className="label text-muted">{step.phase} · Paso {index + 1} de {BEGINNER_ROUTINE.length}</p>
      <div><h2 className="text-xl font-semibold text-ink">{exercise.name}</h2><p className="mt-2 text-sm text-muted">{exercise.goal}</p></div>
      <TrainingReference exerciseId={exercise.id} exerciseName={exercise.name} />
      <p className="text-sm text-ink"><strong>Necesitás:</strong> {exercise.equipment}</p>
      <div><h3 className="font-semibold text-ink">Cómo hacerlo</h3><ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted">{exercise.steps.map((item) => <li key={item}>{item}</li>)}</ol></div>
      <div><h3 className="font-semibold text-ink">Prestá atención</h3><ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-muted">{exercise.cues.map((item) => <li key={item}>{item}</li>)}</ul></div>
      <p className="text-sm leading-6 text-ink"><strong>Propuesta pendiente de revisión:</strong> {step.prescription}</p>
      <p className="text-sm leading-6 text-amber-950">{exercise.caution} Frená si aparece dolor.</p>
      <div className="space-y-3 border-t border-hairline pt-4"><h3 className="font-semibold text-ink">Descanso orientativo: {step.restSeconds} segundos</h3><p className="text-xs leading-5 text-muted">Entre series o antes del siguiente ejercicio. El tiempo debe revisarse con un profesional; el reloj no mide tu recuperación.</p><button type="button" onClick={() => { setSeconds(step.restSeconds); setEndTime(Date.now() + step.restSeconds * 1000); }} className="border border-ink px-4 py-2 text-sm text-ink">{endTime === null ? "Iniciar descanso" : "Reiniciar descanso"}</button>{endTime !== null && <div><p aria-hidden="true" className="text-2xl font-semibold tabular-nums text-ink">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</p><p role="status" className="text-sm text-muted">{seconds === 0 ? "Tiempo cumplido. Continuá cuando estés listo." : "Descanso en curso."}</p></div>}</div>
      <div className="flex flex-wrap gap-3"><button type="button" onClick={() => { setEndTime(null); if (index + 1 < BEGINNER_ROUTINE.length) setIndex(index + 1); else setStage("feedback"); }} className="bg-ink px-5 py-3 text-sm text-canvas">{index + 1 === BEGINNER_ROUTINE.length ? "Terminar recorrido" : "Siguiente ejercicio"}</button><button type="button" onClick={() => { setStoppedEarly(true); setEndTime(null); setStage("feedback"); }} className="border border-hairline px-5 py-3 text-sm text-ink">Detener la sesión</button></div>
      <p className="text-xs leading-5 text-muted">El avance no es automático ni se guarda. Videos y evaluación de ejecución aún no están disponibles.</p>
    </section>
  );
}
