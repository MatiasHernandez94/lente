/** Calcula el tiempo con el reloj real, incluso al volver de otra pestaña. */
export function remainingSeconds(endTime: number, now: number): number {
  return Math.max(0, Math.ceil((endTime - now) / 1000));
}

export function nextExerciseIndex(index: number, count: number): number | null {
  return index >= 0 && index + 1 < count ? index + 1 : null;
}
