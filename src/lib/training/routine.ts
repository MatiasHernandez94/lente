export type Effort = "facil" | "moderado" | "dificil";

interface RoutineStep {
  phase: "Calentamiento" | "Trabajo principal" | "Vuelta a la calma";
  exerciseId: string;
  prescription: string;
  restSeconds: number;
}

/** Borrador para revisión profesional; no es una prescripción individual. */
export const BEGINNER_ROUTINE: readonly RoutineStep[] = [
  { phase: "Calentamiento", exerciseId: "movilidad-tobillo", prescription: "1 serie de 8 movimientos suaves por lado.", restSeconds: 60 },
  { phase: "Trabajo principal", exerciseId: "sentadilla-goblet", prescription: "2 series de 6 a 8 repeticiones, sin peso o con carga liviana y controlada.", restSeconds: 90 },
  { phase: "Trabajo principal", exerciseId: "remo-mancuerna", prescription: "2 series de 8 repeticiones por lado, con carga liviana y controlada.", restSeconds: 90 },
  { phase: "Trabajo principal", exerciseId: "dead-bug", prescription: "2 series de 5 repeticiones lentas por lado.", restSeconds: 60 },
  { phase: "Vuelta a la calma", exerciseId: "rotacion-toracica", prescription: "1 serie de 6 movimientos suaves por lado.", restSeconds: 60 },
];

export function feedbackMessage(effort: Effort | null, pain: boolean): string {
  if (pain) return "Si sentiste dolor, detené el ejercicio y consultá a un profesional antes de retomarlo. No se ajustó tu rutina automáticamente.";
  if (effort === "dificil") return "Contale a un profesional que la sesión resultó difícil para revisar volumen, descansos y cargas antes de repetirla. No se ajustó automáticamente.";
  if (effort === "moderado" || effort === "facil") return "Compartí tu sensación con un profesional antes de cambiar el entrenamiento. No aumentamos las cargas automáticamente.";
  return "Sin respuesta de esfuerzo: no podemos orientar una revisión. Consultá a un profesional antes de modificar la rutina.";
}
