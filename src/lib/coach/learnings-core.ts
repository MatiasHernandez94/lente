import type { Sport } from "@/lib/analysis/types";

/**
 * Lógica pura de la memoria de aprendizajes.
 *
 * Vive separada de `learnings.ts` (que hace el I/O contra Supabase) por una
 * razón concreta: este módulo no importa nada en runtime, así que es testeable
 * con `node:test` sin credenciales ni base de datos. La versión anterior tenía
 * el ranking y la construcción de textos enterrados dentro de funciones que
 * importaban `@/lib/db`, que node:test no resuelve y que exige variables de
 * entorno de Supabase.
 *
 * Acá queda solo la decisión: a quién se le muestra qué, en qué orden, y cómo
 * se redacta un aprendizaje a partir del feedback.
 */

export interface CoachLearning {
  id: string;
  origen: "curado" | "usuario" | "negativo";
  userId: string | null;
  sport: Sport;
  errorType: string | null;
  learning: string;
  videoId: string | null;
  rating: number | null;
  uses: number;
}

/** Cuántos aprendizajes se inyectan como máximo en un prompt. */
export const MAX_INJECTED = 2;

/** Prioridad de origen: lo curado pesa más que lo puntual de un video. */
export const ORIGEN_WEIGHT = { curado: 3, negativo: 2, usuario: 1 } as const;

/**
 * Filtra y ordena los aprendizajes visibles para un usuario.
 *
 * Reglas, en orden de importancia:
 *  1. **Aislamiento**: solo los curados (globales) y los propios. Un video
 *     ajeno ancla el modelo a otro cuerpo y otro contexto, así que no se
 *     cruzan cuentas.
 *  2. Un aprendizaje con rating negativo se descarta: el usuario dijo que no
 *     sirvió.
 *  3. Con tipo de falla conocido, manda la coincidencia. Sin saberlo (se
 *     recupera antes de clasificar), van primero los universales: uno etiquetado
 *     con un tipo específico podría no aplicar.
 *  4. A igualdad, peso del origen, luego rating, luego menor uso (para rotar).
 */
export function rankLearnings(
  candidates: CoachLearning[],
  errorType: string | null,
  userId: string | null,
  limit = MAX_INJECTED,
): CoachLearning[] {
  const visible = candidates.filter(
    (l) => l.origen === "curado" || (userId != null && l.userId === userId),
  );

  return visible
    // rating 0 = el usuario marcó que no sirvió: se descarta. `>= 0` era un
    // no-op que dejaba pasar todo.
    .filter((l) => l.rating == null || l.rating > 0)
    .sort((a, b) => {
      const typeMatch =
        Number(b.errorType != null && b.errorType === errorType) -
        Number(a.errorType != null && a.errorType === errorType);
      if (typeMatch !== 0) return typeMatch;

      if (errorType == null) {
        // Sin tipo conocido: los universales primero.
        // Sort negativo = va primero. Con `== null` quedaba invertido y los
        // universales salían al final, justo lo contrario de la intención.
        const universal = Number(a.errorType != null) - Number(b.errorType != null);
        if (universal !== 0) return universal;
      }

      const origen = ORIGEN_WEIGHT[b.origen] - ORIGEN_WEIGHT[a.origen];
      if (origen !== 0) return origen;

      const rating = (b.rating ?? 0.5) - (a.rating ?? 0.5);
      if (rating !== 0) return rating;

      return a.uses - b.uses;
    })
    .slice(0, limit);
}

/**
 * Redacta el aprendizaje a guardar a partir del feedback del usuario.
 *
 * El negativo se construye como **restricción** ("no repitas X"), no como
 * ejemplo positivo: prohibir algo es más estable de inyectar que sugerir otra
 * cosa, y no compite con la recomendación que el modelo daría esta vez.
 */
export function buildLearningText(params: {
  recommendation: string;
  helpful: boolean;
  correction?: string;
}): string {
  if (params.helpful) {
    return `Ajuste validado por el usuario: ${params.recommendation} funcionó para este caso; mantenelo.`;
  }

  const correction = params.correction?.trim();
  if (correction) {
    return `No repitas: ${params.recommendation}. En este caso lo correcto fue: ${correction}.`;
  }

  return `No repitas: ${params.recommendation}. El usuario marcó que no aplicaba.`;
}

/**
 * Texto de memoria dinámica para inyectar en el prompt.
 *
 * Devuelve string vacío si no hay nada: es preferible omitir la sección a
 * mandar una vacía que el modelo interprete como "hay aprendizajes".
 */
export function formatLearningsForPrompt(learnings: CoachLearning[]): string {
  if (learnings.length === 0) return "";

  const lines = learnings.map((l, i) => `${i + 1}. ${l.learning}`);

  return [
    `AJUSTES APRENDIDOS de análisis anteriores. Aplicá SOLO los que correspondan a este caso; si uno no aplica, ignoralo en silencio:`,
    ...lines,
  ].join("\n");
}
