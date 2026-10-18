import type { Sport } from "@/lib/analysis/types";

/**
 * Auditoría determinista de métricas (paso 2 del razonamiento táctico).
 *
 * Comparar un número medido contra un rango de referencia es aritmética, no
 * razonamiento: hacerlo con un modelo de IA encarece y enlentece el análisis sin
 * ganar nada. Acá se resuelve con TypeScript, de forma auditable, y el resultado
 * se le pasa al agente como ground truth para los pasos 3 (clasificar el error)
 * y 4 (elegir la corrección más crítica).
 *
 * Regla de oro: si no se pudo medir algo, eso TAMBIÉN es un hallazgo, y el más
 * honesto. Un análisis que dice "no pude ver la pelota" es más útil que uno que
 * inventa una métrica de posesión.
 */

export type AuditStatus = "normal" | "bajo" | "alto" | "no_medible" | "sin_referencia";

export interface AuditFinding {
  /** Clave de la métrica auditada. */
  key: string;
  /** Nombre legible para mostrar. */
  label: string;
  /** Valor medido, ya formateado. */
  value: string;
  /** Rango de referencia usado, formateado para humanos. */
  reference: string;
  /** Código corto del rango, para la serialización compacta. */
  referenceCode: string;
  status: AuditStatus;
  /** Cuán lejos del rango está, en unidades del rango. Negativo = por debajo. */
  deviation: number | null;
  /** Qué significa el hallazgo para el deportista. */
  implication: string;
}

export interface AuditResult {
  sport: Sport;
  mode: "solo" | "team";
  findings: AuditFinding[];
  /** Hallazgos accionables (fuera de rango o no medibles), priorizados. */
  issues: AuditFinding[];
  /**
   * Desglose de las métricas auditadas.
   *
   * Las cuatro categorías suman `audited`: `sin_referencia` cuenta aparte para
   * que las cuentas cierren y se vea cuántas métricas se midieron pero no
   * tienen contra qué compararse.
   */
  coverage: {
    audited: number;
    normal: number;
    out_of_range: number;
    unmeasurable: number;
    sin_referencia: number;
  };
  /**
   * Confianza global del análisis. Si la calidad de datos es baja, el agente
   * tiene que bajar el tono de sus conclusiones en vez de sentenciar.
   */
  confidence: "alta" | "media" | "baja";
  confidenceReason: string;
}

interface Range {
  min?: number;
  max?: number;
  /** Qué implica estar por debajo / por encima. */
  lowNote: string;
  highNote: string;
  /** Texto del rango para mostrar. */
  label: string;
  /** Código corto para la serialización compacta del prompt. */
  code: string;
}

// ── Rangos de referencia ──
// Solo se incluyen rangos defendibles. Cuando una métrica no tiene un estándar
// claro (la amplitud de un salto depende del ejercicio), se marca
// `sin_referencia` y se le pasa al agente cruda, sin opinión inventada.

const REFERENCE: Record<string, Range> = {
  // Consistencia del ritmo: aplica a cualquier ejercicio repetitivo.
  rhythm_consistency: {
    min: 0.85,
    label: "≥ 85% de consistencia",
    code: ">=.85",
    lowNote:
      "el ritmo es irregular: hay variación entre repeticiones, señal de técnica inestable o de fatiga temprana",
    highNote: "ritmo muy consistente",
  },
  // Decaimiento de intensidad dentro de la propia sesión.
  intensity_change: {
    min: -20,
    label: "caída ≤ 20% entre el inicio y el final",
    code: ">=-20",
    lowNote:
      "la intensidad cae más de un 20% del inicio al final: el sujeto no sostiene el esfuerzo durante todo el video",
    highNote: "la intensidad sube notablemente hacia el final (calentamiento progresivo o sprint final)",
  },
  // Ratio trabajo/descanso para entrenamiento por intervalos.
  work_rest_ratio: {
    min: 2,
    max: 6,
    label: "2:1 a 6:1 en intervalos",
    code: "2..6",
    lowNote:
      "predomina el descanso sobre el trabajo: los intervalos son más largos de lo buscado o la serie se cortó",
    highNote: "trabajo casi sin pausas: o es un bloque continuo (correcto) o faltan los descansos del protocolo",
  },
  // Velocidad horizontal en actividad individual.
  solo_avg_speed: {
    min: 0.3,
    max: 4,
    label: "0.3–4 m/s según el ejercicio",
    code: ".3..4",
    lowNote:
      "desplazamiento horizontal casi nulo: esperable en ejercicios en el lugar (saltar la cuerda, golpes de puño), no en desplazamientos",
    highNote: "velocidad horizontal alta: desplazamiento continuo, no ejercicio estático",
  },
};

// Rangos para modo equipo.
const TEAM_REFERENCE: Record<string, Range> = {
  team_players: {
    min: 4,
    label: "≥ 4 jugadores para poder hablar de bloque táctico",
    code: ">=4",
    lowNote:
      "muy pocas personas rastreadas para evaluar un sistema táctico: enfocá en acciones individuales",
    highNote: "",
  },
  ball_tracked: {
    min: 20,
    label: "≥ 20% de frames con balón visible",
    code: ">=20",
    lowNote:
      "el balón casi no se ve: cualquier métrica de posesión, presión o pase es pura especulación",
    highNote: "",
  },
  distance_per_player: {
    min: 800,
    label: "≥ 800 m por jugador en un partido",
    code: ">=800",
    lowNote:
      "distancia por jugador muy baja para un partido: o el video es un fragmento corto, o la escala no está calibrada",
    highNote: "",
  },
};

function inRange(value: number, range: Range): AuditStatus {
  if (range.min != null && value < range.min) return "bajo";
  if (range.max != null && value > range.max) return "alto";
  return "normal";
}

function deviationIn(value: number, range: Range): number | null {
  if (range.min != null && value < range.min) {
    const span = Math.abs(range.min) || 1;
    return value < 0 ? -1 : (value - range.min) / span;
  }
  if (range.max != null && value > range.max) {
    const span = Math.abs(range.max) || 1;
    return (value - range.max) / span;
  }
  return 0;
}

function finding(
  key: string,
  label: string,
  value: string,
  reference: string,
  status: AuditStatus,
  deviation: number | null,
  implication: string,
  referenceCode = "",
): AuditFinding {
  return { key, label, value, reference, referenceCode, status, deviation, implication };
}

/** Formatea un booleano de "no medible" como hallazgo honesto. */
function unmeasurable(key: string, label: string, reason: string): AuditFinding {
  return finding(key, label, "no medible", "—", "no_medible", null, reason);
}

/**
 * Audita las métricas del pipeline contra los rangos de referencia.
 *
 * Acepta el análisis deportivo crudo (`/api/videos/[id]/sports`) y devuelve
 * hallazgos priorizados. No llama a ninguna IA.
 */
export function auditAnalysis(input: {
  sport: Sport;
  mode: "solo" | "team";
  solo?: Record<string, unknown> | null;
  sport_metrics?: Record<string, unknown> | null;
  tracking?: { summary?: Record<string, unknown> } | null;
  duration_s?: number;
}): AuditResult {
  const findings: AuditFinding[] = [];

  // Contexto de duración: sobre un fragmento corto no se puede concluir sobre
  // resistencia, desgaste o volumen de un partido. Se declara antes que
  // cualquier otra cosa para que el agente no sentencie de más.
  const duration = Number(input.duration_s ?? 0);
  const isFragment = duration > 0 && duration < 300;
  if (isFragment) {
    findings.push(
      finding(
        "video_duration",
        "Duración del video",
        `${duration.toFixed(0)}s`,
        "≥ 300s para evaluar resistencia o desgaste",
        "sin_referencia",
        null,
        "el video es un fragmento corto: sirve para evaluar técnica y recursos puntuales, no resistencia ni volumen de trabajo",
      ),
    );
  }

  if (input.mode === "solo") {
    auditSolo(findings, input);
  } else {
    auditTeam(findings, input);
  }

  const issues = findings
    .filter((f) => f.status === "bajo" || f.status === "alto" || f.status === "no_medible")
    .sort((a, b) => {
      // Los no medibles pesan: sin dato no hay conclusión posible.
      if (a.status === "no_medible" && b.status !== "no_medible") return -1;
      if (b.status === "no_medible" && a.status !== "no_medible") return 1;
      return Math.abs(b.deviation ?? 0) - Math.abs(a.deviation ?? 0);
    });

  const coverage = {
    audited: findings.length,
    normal: findings.filter((f) => f.status === "normal").length,
    out_of_range: findings.filter((f) => f.status === "bajo" || f.status === "alto").length,
    unmeasurable: findings.filter((f) => f.status === "no_medible").length,
    sin_referencia: findings.filter((f) => f.status === "sin_referencia").length,
  };

  // Las cuatro categorías cubren todos los estados posibles, así que deben
  // sumar el total. Si no cierran, se agregó un estado nuevo sin contarlo.
  const sum = coverage.normal + coverage.out_of_range + coverage.unmeasurable + coverage.sin_referencia;
  if (sum !== coverage.audited) {
    throw new Error(
      `coverage inconsistente: ${sum} !== ${coverage.audited} (¿estado de hallazgo sin clasificar?)`,
    );
  }

  const { confidence, confidenceReason } = rateConfidence(coverage, findings);

  return { sport: input.sport, mode: input.mode, findings, issues, coverage, confidence, confidenceReason };
}

function auditSolo(findings: AuditFinding[], input: Record<string, unknown>): void {
  const solo = (input.solo ?? {}) as Record<string, unknown>;
  const rhythm = (solo.rhythm ?? {}) as Record<string, unknown>;
  const intensity = (solo.intensity ?? {}) as Record<string, unknown>;
  const detailed = (solo.detailed ?? {}) as Record<string, unknown>;
  const movement = (solo.movement ?? {}) as Record<string, unknown>;

  // ── 1. ¿Hay siquiera una actividad rítmica que auditar? ──
  if (rhythm.rhythm_detected !== true) {
    findings.push(
      unmeasurable(
        "rhythm",
        "Ritmo del ejercicio",
        "no se detectó una oscilación rítmica clara en el movimiento del sujeto, así que no se puede evaluar cadencia ni consistencia",
      ),
    );
  } else {
    const consistency = Number(rhythm.consistency ?? 0);
    const range = REFERENCE.rhythm_consistency;
    const status = inRange(consistency, range);
    findings.push(
      finding(
        "rhythm_consistency",
        "Consistencia del ritmo",
        `${(consistency * 100).toFixed(0)}%`,
        range.label,
        status,
        deviationIn(consistency, range),
        status === "normal" ? "ritmo estable entre repeticiones" : status === "bajo" ? range.lowNote : range.highNote,
        range.code,
      ),
    );

    const rpm = Number(rhythm.frequency_rpm ?? 0);
    findings.push(
      finding(
        "rhythm_rpm",
        "Cadencia",
        `${rpm.toFixed(0)} rep/min`,
        "sin referencia universal (depende del ejercicio)",
        "sin_referencia",
        null,
        "cadencia medida; comparala contra tu propio histórico, no contra un valor fijo",
      ),
    );

    const amplitude = rhythm.oscillation_amplitude_m;
    if (typeof amplitude === "number") {
      findings.push(
        finding(
          "rhythm_amplitude",
          "Amplitud del movimiento",
          `${(amplitude * 100).toFixed(0)} cm`,
          "sin referencia universal (depende del ejercicio)",
          "sin_referencia",
          null,
          "recorrido vertical por ciclo; útil para ver si la altura de salto se mantiene o decae",
        ),
      );
    }
  }

  // ── 2. ¿Sostiene el esfuerzo o se apaga? ──
  const trend = String(detailed.intensity_trend ?? "");
  const change = Number(detailed.intensity_change_pct ?? 0);
  if (trend) {
    const range = REFERENCE.intensity_change;
    const status = inRange(change, range);
    findings.push(
      finding(
        "intensity_trend",
        "Tendencia de intensidad",
        `${trend} (${change > 0 ? "+" : ""}${change.toFixed(0)}%)`,
        range.label,
        status,
        deviationIn(change, range),
        status === "normal" ? "mantiene el nivel de esfuerzo" : status === "bajo" ? range.lowNote : range.highNote,
        range.code,
      ),
    );
  } else {
    findings.push(
      unmeasurable(
        "intensity_trend",
        "Tendencia de intensidad",
        "no hay suficientes muestras de velocidad para ver si el sujeto sostiene o baja el ritmo durante el video",
      ),
    );
  }

  // ── 3. Estructura trabajo/descanso ──
  const ratio = detailed.work_rest_ratio;
  const restPeriods = Number(detailed.rest_periods ?? 0);
  if (typeof ratio === "number") {
    const range = REFERENCE.work_rest_ratio;
    const status = inRange(ratio, range);
    findings.push(
      finding(
        "work_rest_ratio",
        "Ratio trabajo/descanso",
        `${ratio.toFixed(1)}:1`,
        range.label,
        status,
        deviationIn(ratio, range),
        status === "normal" ? "estructura de intervalos dentro de lo esperado" : status === "bajo" ? range.lowNote : range.highNote,
        range.code,
      ),
    );
  } else if (restPeriods > 0) {
    findings.push(
      finding(
        "work_rest_ratio",
        "Ratio trabajo/descanso",
        `${restPeriods} pausas sin cuantificar`,
        REFERENCE.work_rest_ratio.label,
        "sin_referencia",
        null,
        "se detectaron pausas pero el video es demasiado corto para calcular un ratio fiable",
      ),
    );
  }

  // ── 4. Velocidad horizontal (con contexto del ejercicio) ──
  const avgSpeed = Number(intensity.avg_speed_mps ?? 0);
  if (avgSpeed > 0) {
    const range = REFERENCE.solo_avg_speed;
    const pattern = String(movement.pattern ?? "");
    // Un ejercicio en el lugar tiene desplazamiento bajo por diseño: no es un
    // hallazgo negativo, es una descripción del ejercicio.
    const status = pattern === "stationary" || pattern === "oscillating" ? "normal" : inRange(avgSpeed, range);
    findings.push(
      finding(
        "solo_avg_speed",
        "Velocidad horizontal",
        `${avgSpeed.toFixed(2)} m/s`,
        range.label,
        status,
        status === "normal" ? 0 : deviationIn(avgSpeed, range),
        pattern === "oscillating"
          ? "movimiento oscilatorio en el lugar: esperable en ejercicios repetitivos, el trabajo es vertical no horizontal"
          : status === "normal"
            ? "desplazamiento acorde al ejercicio"
            : status === "bajo"
              ? range.lowNote
              : range.highNote,
        range.code,
      ),
    );
  } else {
    findings.push(
      unmeasurable(
        "solo_avg_speed",
        "Velocidad horizontal",
        "no se pudo estimar la velocidad: falta escala de calibración o el sujeto no se rastreó de forma continua",
      ),
    );
  }
}

function auditTeam(findings: AuditFinding[], input: Record<string, unknown>): void {
  const metrics = (input.sport_metrics ?? {}) as Record<string, unknown>;
  const summary = (input.tracking ?? {}) as { summary?: Record<string, unknown> };
  const s = summary.summary ?? {};

  const players = Number(s.total_players_detected ?? metrics.player_count ?? 0);
  const teamRange = TEAM_REFERENCE.team_players;
  const playerStatus = inRange(players, teamRange);
  findings.push(
    finding(
      "team_players",
      "Personas rastreadas",
      `${players}`,
      teamRange.label,
      playerStatus,
      deviationIn(players, teamRange),
      playerStatus === "normal"
        ? "hay suficientes jugadores para evaluar un bloque táctico"
        : teamRange.lowNote,
      teamRange.code,
    ),
  );

  const ballPct = Number(metrics.ball_tracked_pct ?? 0);
  const ballRange = TEAM_REFERENCE.ball_tracked;
  const ballStatus = inRange(ballPct, ballRange);
  findings.push(
    finding(
      "ball_tracked",
      "Balón visible",
      `${ballPct.toFixed(0)}% de los frames`,
      ballRange.label,
      ballStatus,
      deviationIn(ballPct, ballRange),
      ballStatus === "normal"
        ? "el balón se ve lo suficiente para hablar de posesión y presión"
        : ballRange.lowNote,
      ballRange.code,
    ),
  );

  const perPlayer = Number(metrics.distance_per_player_m ?? 0);
  if (perPlayer > 0) {
    const distRange = TEAM_REFERENCE.distance_per_player;
    // La referencia de 800 m es de un partido completo. Sobre un fragmento
    // corto esa comparación es injusta y genera un "hallazgo" que no existe:
    // se escala la expectativa a la duración real del video.
    const duration = Number(input.duration_s ?? 0);
    const isFragment = duration > 0 && duration < 600;
    const expected = isFragment ? distRange.min! * (duration / 5400) : distRange.min!;
    const status = perPlayer >= expected ? "normal" : "bajo";
    findings.push(
      finding(
        "distance_per_player",
        "Distancia por jugador",
        `${perPlayer.toFixed(0)} m`,
        isFragment
          ? `≥ ${expected.toFixed(0)} m para un fragmento de ${duration.toFixed(0)}s`
          : distRange.label,
        status,
        status === "normal" ? 0 : deviationIn(perPlayer, distRange),
        status === "normal"
          ? "volumen de desplazamiento acorde a la duración del video"
          : isFragment
            ? `desplazamiento bajo incluso para un fragmento de ${duration.toFixed(0)}s: o la toma es fija sobre una zona, o la escala no está calibrada`
            : distRange.lowNote,
        isFragment ? `>=${expected.toFixed(0)}` : distRange.code,
      ),
    );
  }

  const sprintPct = Number(metrics.sprint_samples_pct ?? 0);
  findings.push(
    finding(
      "sprint_share",
      "Tiempo en sprint",
      `${sprintPct.toFixed(0)}%`,
      "sin referencia universal (depende del puesto y del momento)",
      "sin_referencia",
      null,
      "proporción del tiempo a máxima intensidad; comparala entre jugadores del mismo video",
    ),
  );
}

function rateConfidence(
  coverage: AuditResult["coverage"],
  findings: AuditFinding[],
): { confidence: AuditResult["confidence"]; confidenceReason: string } {
  // Un hallazgo "no medible" en una métrica central baja la confianza: sin ese
  // dato, cualquier conclusión sobre ese aspecto es adivinanza.
  const criticalMissing = findings.filter(
    (f) => f.status === "no_medible" && (f.key === "rhythm" || f.key === "ball_tracked" || f.key === "team_players"),
  );
  if (criticalMissing.length > 0) {
    return {
      confidence: "baja",
      confidenceReason: `no se pudo medir: ${criticalMissing.map((f) => f.label.toLowerCase()).join(", ")}`,
    };
  }
  if (coverage.unmeasurable >= 2 || (coverage.audited > 0 && coverage.out_of_range > coverage.audited / 2)) {
    return {
      confidence: "media",
      confidenceReason: "varias métricas quedaron fuera de rango o sin cubrir: las conclusiones son parciales",
    };
  }
  return { confidence: "alta", confidenceReason: "las métricas clave se midieron y están dentro de lo esperado" };
}

/** Texto compacto del auditorío para inyectar en prompts. */
export function formatAuditForPrompt(audit: AuditResult): string {
  if (audit.findings.length === 0) return "Sin métricas para auditar.";

  const lines = audit.findings.map((f) => {
    const status =
      f.status === "normal"
        ? "OK"
        : f.status === "no_medible"
          ? "NO MEDIBLE"
          : f.status === "sin_referencia"
            ? "SIN REFERENCIA"
            : f.status.toUpperCase();
    return `- [${status}] ${f.label}: ${f.value} (ref: ${f.reference}) → ${f.implication}`;
  });

  return [
    ...lines,
    "",
    `Confianza del análisis: ${audit.confidence.toUpperCase()} — ${audit.confidenceReason}.`,
    audit.confidence !== "alta"
      ? "Si la confianza no es alta, bajá el tono de las conclusiones: explicá qué falta medir antes de recomendar."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Serialización compacta del auditorío para prompts.
 *
 * No se manda prosa ("el ritmo es irregular, señal de técnica inestable") sino
 * los números y su estado. Las implicaciones son hechos que ya calculamos:
 * explicarlas en español en cada llamada gasta tokens sin darle información
 * nueva al modelo, que interpreta solo `{k: "rhythm_consistency", v: 0.69,
 * ref: ">=.85", s: "low"}`.
 *
 * El rango viaja como código ("≥ 85% de consistencia" → ">=.85") porque se
 * repetía textual en cada hallazgo sin referencia real.
 */
export function formatAuditCompact(audit: AuditResult): string {
  if (audit.findings.length === 0) return "audit:{}";

  // [k, valor, estado, ref] — sin etiquetas repetidas, sin prosa.
  const rows = audit.findings.map((f) => {
    const num = toNumber(f.value);
    return [f.key, num ?? f.value, f.status, f.referenceCode || "n/a"];
  });

  const payload = { a: rows, c: audit.confidence, s: audit.coverage };

  return [
    `AUDITORÍA (ground truth, formato [key,valor,estado,ref]; estado: ok|low|high|unmeasurable|noref;`,
    `s: {a auditadas,n ok,o fuera_de_rango,u no_medibles}). La prosa ya está resuelta, no la reescribas:`,
    JSON.stringify(payload),
  ].join("\n");
}

function toNumber(value: string): number | null {
  // Solo se numera si el valor EMPIEZA con un número ("139 rep/min", "25 cm").
  // Si arranca con texto ("estable (-6%)") la etiqueta cualitativa es
  // información, no decorado: convertirla a -6 borraría la diferencia entre
  // "ritmo estable" y "ritmo en descenso", que son conclusiones opuestas.
  const match = value.match(/^\s*(-?\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const n = Number(match[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
