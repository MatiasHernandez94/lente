import "server-only";
import { randomUUID } from "node:crypto";
import { getClient } from "@/lib/db";
import type { Sport } from "@/lib/analysis/types";

/**
 * Memoria de aprendizajes del coach.
 *
 * El objetivo es que el agente gane precisión con el uso sin reentrenar nada y
 * sin inflar el prompt base: en cada análisis se recuperan uno o dos
 * aprendizajes relevantes y se inyectan como memoria dinámica.
 *
 * Sobre el alcance, que es la parte delicada:
 *   - Los aprendizajes CURADOS (los que escribimos desde el conocimiento por
 *     deporte) son globales: aplican a todos y son conocimiento transferible.
 *   - Los del USUARIO solo se le inyectan a él. Un video de otra persona ancla
 *     el modelo a otro cuerpo y otro contexto, así que no se cruzan cuentas.
 *   - Los NEGATIVOS son restricciones ("no marques esto como error"), que
 *     resultan más estables que un ejemplo positivo.
 *
 * No hace falta vector store: la recuperación es por deporte + tipo de falla,
 * que es exactamente la dimensión en la que el aprendizaje aplica. Si algún día
 * el volumen lo justifica, se agrega similitud semántica encima.
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
const MAX_INJECTED = 2;

/** Prioridad de origen: lo curado pesa más que lo puntual de un video. */
const ORIGEN_WEIGHT = { curado: 3, negativo: 2, usuario: 1 } as const;

interface LearningRow {
  id: string;
  origen: string;
  user_id: string | null;
  sport: string;
  error_type: string | null;
  learning: string;
  video_id: string | null;
  rating: number | null;
  uses: number;
}

function toLearning(row: LearningRow): CoachLearning {
  return {
    id: row.id,
    origen: row.origen as CoachLearning["origen"],
    userId: row.user_id,
    sport: row.sport as Sport,
    errorType: row.error_type,
    learning: row.learning,
    videoId: row.video_id,
    rating: row.rating,
    uses: row.uses,
  };
}

/**
 * Recupera los aprendizajes aplicables a este deporte y tipo de falla.
 *
 * Se piden más de los necesarios porque el filtrado por utilidad ocurre acá:
 * un aprendizaje con rating negativo o que ya se usó mucho sinFeedback deja de
 * ser novedad y estorba en el prompt.
 */
export async function getRelevantLearnings(
  sport: Sport,
  errorType: string | null,
  userId: string | null,
  limit = MAX_INJECTED,
): Promise<CoachLearning[]> {
  try {
    const { data, error } = await getClient()
      .from("coach_learnings")
      .select("*")
      .eq("sport", sport)
      .limit(limit * 4);

    if (error) {
      console.error("getRelevantLearnings:", error);
      return [];
    }
    if (!data) return [];

    const rows = (data as LearningRow[]).map(toLearning);

    // Visibles para este usuario: los curados (globales) y los propios.
    const visible = rows.filter(
      (l) => l.origen === "curado" || (userId != null && l.userId === userId),
    );

    // Orden de recuperación.
    // Si todavía no se conoce el tipo de falla (se recupera antes de clasificar),
    // un aprendizaje etiquetado con un tipo específico puede no aplicar: se
    // priorizan los universales y se deja que el modelo descarte el resto.
    const ranked = visible
      .filter((l) => l.rating == null || l.rating >= 0)
      .sort((a, b) => {
        const typeMatch =
          Number(b.errorType != null && b.errorType === errorType) -
          Number(a.errorType != null && a.errorType === errorType);
        if (typeMatch !== 0) return typeMatch;

        if (errorType == null) {
          // Sin tipo conocido: los universales primero.
          const universal =
            Number(a.errorType == null) - Number(b.errorType == null);
          if (universal !== 0) return universal;
        }

        const origen = ORIGEN_WEIGHT[b.origen] - ORIGEN_WEIGHT[a.origen];
        if (origen !== 0) return origen;
        const rating = (b.rating ?? 0.5) - (a.rating ?? 0.5);
        if (rating !== 0) return rating;
        return a.uses - b.uses;
      });

    const picked = ranked.slice(0, limit);
    if (picked.length > 0) void bumpUses(picked.map((p) => p.id));
    return picked;
  } catch {
    // La memoria es una mejora, no una dependencia: si falla, el análisis sigue.
    return [];
  }
}

/**
 * Texto de memoria dinámica para inyectar en el prompt.
 *
 * Devuelve string vacío si no hay nada: es preferible no mandar la sección a
 * mandar una sección vacía que el modelo interprete como "hay aprendizajes".
 */
export function formatLearningsForPrompt(learnings: CoachLearning[]): string {
  if (learnings.length === 0) return "";

  const lines = learnings.map((l, i) => `${i + 1}. ${l.learning}`);

  return [
    `AJUSTES APRENDIDOS de análisis anteriores. Aplicá SOLO los que correspondan a este caso; si uno no aplica, ignoralo en silencio:`,
    ...lines,
  ].join("\n");
}

/** Guarda un feedback del usuario sobre una corrección concreta. */
export async function saveUserFeedback(params: {
  userId: string;
  videoId: string;
  sport: Sport;
  errorType: string | null;
  /** Qué dijo el agente. */
  recommendation: string;
  /** true = acertó, false = no sirvió. */
  helpful: boolean;
  /** Corrección del usuario, si quiso dejar una. */
  correction?: string;
}): Promise<CoachLearning | null> {
  const now = new Date().toISOString();

  // Con feedback negativo se guarda como RESTRICCIÓN, no como ejemplo: "no
  // hagas X" es más estable de inyectar que "hacé Y".
  const learning = params.helpful
    ? `Ajuste validado por el usuario: ${params.recommendation} funcionó para este caso; mantenelo.`
    : params.correction?.trim()
      ? `No repitas: ${params.recommendation}. En este caso lo correcto fue: ${params.correction.trim()}.`
      : `No repitas: ${params.recommendation}. El usuario marcó que no aplicaba.`;

  const row = {
    id: randomUUID(),
    origen: params.helpful ? ("usuario" as const) : ("negativo" as const),
    user_id: params.userId,
    sport: params.sport,
    error_type: params.errorType,
    learning,
    video_id: params.videoId,
    rating: params.helpful ? 1 : 0,
    uses: 0,
    created_at: now,
    updated_at: now,
  };

  const { error } = await getClient().from("coach_learnings").insert(row);
  if (error) {
    console.error("saveUserFeedback:", error);
    return null;
  }
  return toLearning({ ...row, origen: row.origen as string });
}

/** Guarda un aprendizaje curado, global para todos los usuarios. */
export async function saveCuratedLearning(params: {
  sport: Sport;
  errorType: string | null;
  learning: string;
}): Promise<CoachLearning | null> {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    origen: "curado" as const,
    user_id: null,
    sport: params.sport,
    error_type: params.errorType,
    learning: params.learning,
    video_id: null,
    rating: null,
    uses: 0,
    created_at: now,
    updated_at: now,
  };

  const { error } = await getClient()
    .from("coach_learnings")
    .upsert(row, { onConflict: "id", ignoreDuplicates: true });
  if (error) {
    console.error("saveCuratedLearning:", error);
    return null;
  }
  return toLearning({ ...row });
}

async function bumpUses(ids: string[]): Promise<void> {
  try {
    // Incremento atómico vía RPC no disponible: se hace con update por id.
    const client = getClient();
    for (const id of ids) {
      const { data } = await client
        .from("coach_learnings")
        .select("uses")
        .eq("id", id)
        .maybeSingle();
      if (data) {
        await client
          .from("coach_learnings")
          .update({ uses: (data.uses ?? 0) + 1, updated_at: new Date().toISOString() })
          .eq("id", id);
      }
    }
  } catch {
    // Contar usos es telemetría: nunca debe romper el análisis.
  }
}

/**
 * Aprendizajes curados iniciales.
 *
 * Se derivan del conocimiento por deporte que ya tenemos y de los sesgos que
 * corregimos a mano en el pipeline (escala, fragmentos cortos, artefactos). No
 * son ejemplos de videos ajenos: son reglas transferibles.
 */
export const CURATED_LEARNINGS: Array<{
  sport: Sport | "general";
  errorType: string | null;
  learning: string;
}> = [
  {
    sport: "general",
    errorType: "condicion_fisica",
    learning:
      "En ejercicios repetitivos en el lugar (saltar la cuerda, golpes, skipping) el desplazamiento horizontal es bajo por diseño. No lo marques como falta de intensidad: el trabajo se mide en la oscilación vertical y en la cadencia.",
  },
  {
    sport: "general",
    errorType: "condicion_fisica",
    learning:
      "Un video de pocos segundos no permite concluir sobre resistencia ni desgaste. Hablá de técnica y de recursos puntuales; si no hay tendencia medible, decilo en vez de inventar una.",
  },
  {
    sport: "general",
    errorType: "postural",
    learning:
      "Las distancias y alturas se estiman desde la altura aparente del sujeto. Cuando la toma cambia de encuadre son aproximadas: no las trates como milimétricas ni corrijas la postura por diferencias de 1-2 cm.",
  },
  {
    sport: "futbol",
    errorType: "tactico",
    learning:
      "Si el balón no se ve en el video, cualquier métrica de posesión o presión es especulación. Basate solo en el movimiento de los jugadores y decilo explícitamente.",
  },
  {
    sport: "baloncesto",
    errorType: "postural",
    learning:
      "Un bote de balón se detecta por oscilación vertical. Si el video es corto o el ángulo es de costado, no fuerces el conteo de botes: reportá que no se pudo medir.",
  },
];

export async function seedCuratedLearnings(): Promise<number> {
  let inserted = 0;
  for (const item of CURATED_LEARNINGS) {
    const saved = await saveCuratedLearning({
      sport: item.sport as Sport,
      errorType: item.errorType,
      learning: item.learning,
    });
    if (saved) inserted += 1;
  }
  return inserted;
}
