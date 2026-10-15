import { test } from "node:test";
import assert from "node:assert/strict";
import type { Sport } from "./types.ts";
import { auditAnalysis, formatAuditCompact, formatAuditForPrompt } from "./audit.ts";

/**
 * Garantías de la auditoría determinista.
 *
 * Journeys que cubren:
 *  1. Auditoría honesta: una métrica fuera de rango o no medible se reporta como
 *     tal, y el conjunto declara su confianza.
 *  2. Sin falsos hallazgos por duración: un clip corto no se compara contra el
 *     estándar de un partido completo.
 *  3. Sin estándar inventado: las métricas sin referencia universal pasan crudas.
 *  4. Serialización fiel: el formato compacto no pierde información cualitativa.
 */

// ── Helper: construcción de entrada mínima ──

function soloInput(overrides: Record<string, unknown> = {}) {
  return {
    sport: "general" as Sport,
    mode: "solo" as const,
    duration_s: 9,
    ...overrides,
  };
}

// ── 1. Auditoría honesta ──

test("una métrica fuera de rango queda en issues con su implicación", () => {
  const audit = auditAnalysis(
    soloInput({
      solo: {
        rhythm: { rhythm_detected: true, consistency: 0.69, frequency_rpm: 139 },
        intensity: { level: "low", score: 21.9, avg_speed_mps: 0.79 },
        movement: { pattern: "oscillating" },
      },
    }),
  );

  const consistency = audit.findings.find((f) => f.key === "rhythm_consistency");
  assert.ok(consistency, "debe existir el hallazgo de consistencia");
  assert.equal(consistency.status, "bajo");
  assert.ok(
    consistency.implication.length > 20,
    "la implicación debe explicar qué significa, no solo el número",
  );

  // El hallazgo accionable tiene que aparecer priorizado en issues.
  assert.ok(
    audit.issues.some((i) => i.key === "rhythm_consistency"),
    "rhythm_consistency debe estar en issues",
  );

  // Las cuatro categorías cubren todos los estados: tienen que sumar el total.
  const c = audit.coverage;
  assert.equal(
    c.normal + c.out_of_range + c.unmeasurable + c.sin_referencia,
    c.audited,
    "los buckets de coverage deben cerrar",
  );
});

test("sin sujeto detectable, el ritmo se declara no medible en vez de inventarse", () => {
  const audit = auditAnalysis(soloInput({ solo: { rhythm: { rhythm_detected: false } } }));

  const rhythm = audit.findings.find((f) => f.key === "rhythm");
  assert.ok(rhythm, "debe haber un hallazgo de ritmo");
  assert.equal(rhythm.status, "no_medible");
  assert.equal(rhythm.value, "no medible");

  // El ritmo es la métrica central de una actividad repetitiva: sin ella, todo
  // lo que dependa de cadencia es adivinanza.
  assert.ok(audit.coverage.unmeasurable >= 1, "al menos el ritmo debe ser no medible");
  assert.equal(audit.confidence, "baja");
  assert.match(audit.confidenceReason, /ritmo/i);

  // No se inventa una frecuencia para rellenar el espacio.
  assert.ok(
    !audit.findings.some((f) => f.key === "rhythm_rpm"),
    "no debe aparecer una cadencia fabricada",
  );
});

test("la confianza es ALTA cuando las métricas clave se midieron, aunque el resultado sea malo", () => {
  // Distinción clave: confianza = "¿se pudo medir?", hallazgo = "¿estuvo bien?".
  // Una consistencia de 30% se mide perfectamente: confianza alta, hallazgo malo.
  const audit = auditAnalysis(
    soloInput({
      solo: {
        rhythm: { rhythm_detected: true, consistency: 0.3, frequency_rpm: 100 },
        intensity: { level: "high", score: 80, avg_speed_mps: 3 },
        movement: { pattern: "linear" },
      },
    }),
  );

  assert.equal(audit.confidence, "alta");
  assert.equal(audit.findings.find((f) => f.key === "rhythm_consistency")?.status, "bajo");
});

// ── 2. Referencias sensibles a la duración ──

test("un video corto no se compara contra la distancia de un partido completo", () => {
  const audit = auditAnalysis({
    sport: "futbol" as Sport,
    mode: "team",
    duration_s: 9,
    tracking: { summary: { total_players_detected: 7 } },
    sport_metrics: {
      player_count: 7,
      distance_per_player_m: 11,
      ball_tracked_pct: 0,
      team_top_speed_mps: 11.51,
      sprint_samples_pct: 34,
      player_label: "jugador",
    },
  });

  const distance = audit.findings.find((f) => f.key === "distance_per_player");
  assert.ok(distance, "debe existir el hallazgo de distancia");
  // 9s de 5400s de partido ⇒ expectativa ~1.4 m, no 800 m.
  assert.equal(distance.status, "normal");
  assert.match(distance.reference, /fragmento de 9s/i);
  assert.equal(distance.referenceCode, ">=1");
});

test("un partido completo sí se compara contra la referencia de 800 m", () => {
  const audit = auditAnalysis({
    sport: "futbol" as Sport,
    mode: "team",
    duration_s: 5400,
    tracking: { summary: { total_players_detected: 22 } },
    sport_metrics: {
      player_count: 22,
      distance_per_player_m: 400,
      ball_tracked_pct: 60,
      sprint_samples_pct: 10,
    },
  });

  const distance = audit.findings.find((f) => f.key === "distance_per_player");
  assert.equal(distance?.status, "bajo");
  assert.match(distance?.reference ?? "", /800/);
});

test("un video de segundos se marca como fragmento corto", () => {
  const audit = auditAnalysis(soloInput());
  const duration = audit.findings.find((f) => f.key === "video_duration");
  assert.ok(duration, "debe declararse la duración");
  assert.match(duration.implication, /fragmento/i);
});

// ── 3. Sin estándar inventado ──

test("las métricas sin referencia universal se marcan sin_referencia y conservan el valor crudo", () => {
  const audit = auditAnalysis(
    soloInput({
      solo: {
        rhythm: {
          rhythm_detected: true,
          consistency: 0.69,
          frequency_rpm: 139,
          oscillation_amplitude_m: 0.249,
        },
        intensity: { level: "low", score: 21.9, avg_speed_mps: 0.79 },
        movement: { pattern: "oscillating" },
      },
    }),
  );

  for (const key of ["rhythm_rpm", "rhythm_amplitude"]) {
    const finding = audit.findings.find((f) => f.key === key);
    assert.ok(finding, `falta el hallazgo ${key}`);
    assert.equal(finding.status, "sin_referencia");
    assert.equal(finding.deviation, null, "sin referencia no puede haber desviación");
  }

  // La cadencia mantiene su valor real, no se normaliza contra un invento.
  assert.match(audit.findings.find((f) => f.key === "rhythm_rpm")?.value ?? "", /139/);
  assert.match(audit.findings.find((f) => f.key === "rhythm_amplitude")?.value ?? "", /25/);
});

// ── 4. Serialización compacta fiel ──

test("el compacto no destruye la etiqueta cualitativa de la tendencia", () => {
  const audit = auditAnalysis(
    soloInput({
      solo: {
        rhythm: { rhythm_detected: true, consistency: 0.69, frequency_rpm: 139 },
        intensity: { level: "low", score: 21.9, avg_speed_mps: 0.79 },
        movement: { pattern: "oscillating" },
        detailed: { intensity_trend: "estable", intensity_change_pct: -5.6 },
      },
    }),
  );

  const compact = formatAuditCompact(audit);
  const row = JSON.parse(compact.slice(compact.lastIndexOf("{\"a\":"))).a as unknown[][];
  const trend = row.find((r) => r[0] === "intensity_trend");

  assert.ok(trend, "debe estar la fila de tendencia");
  // "estable (-6%)" no puede colapsar a -6: estable y descendente con el mismo
  // porcentaje son conclusiones opuestas.
  const value = String(trend[1]);
  assert.match(value, /estable/, "debe conservar la etiqueta cualitativa");
  assert.match(value, /-6/, "y el cambio numérico");
});

test("el compacto sí numera los valores que son número + unidad", () => {
  const audit = auditAnalysis(
    soloInput({
      solo: {
        rhythm: { rhythm_detected: true, consistency: 0.69, frequency_rpm: 139 },
        intensity: { level: "low", score: 21.9, avg_speed_mps: 0.79 },
        movement: { pattern: "oscillating" },
      },
    }),
  );

  const compact = formatAuditCompact(audit);
  const row = JSON.parse(compact.slice(compact.lastIndexOf("{\"a\":"))).a as unknown[][];

  assert.equal(row.find((r) => r[0] === "rhythm_rpm")?.[1], 139);
  assert.equal(row.find((r) => r[0] === "solo_avg_speed")?.[1], 0.79);
  assert.equal(row.find((r) => r[0] === "rhythm_consistency")?.[1], 69);
});

test("el compacto declara el formato para que el modelo lo interprete", () => {
  const audit = auditAnalysis(soloInput());
  const compact = formatAuditCompact(audit);
  assert.match(compact, /key,valor,estado,ref/);
  assert.match(compact, /ok\|low\|high\|unmeasurable\|noref/);
});

test("el verboso incluye la implicación legible de cada hallazgo", () => {
  const audit = auditAnalysis(
    soloInput({
      solo: {
        rhythm: { rhythm_detected: true, consistency: 0.69, frequency_rpm: 139 },
        intensity: { level: "low", score: 21.9, avg_speed_mps: 0.79 },
        movement: { pattern: "oscillating" },
      },
    }),
  );
  const verbose = formatAuditForPrompt(audit);
  assert.match(verbose, /Consistencia del ritmo/);
  assert.match(verbose, /Confianza del análisis/);
  assert.match(verbose, /85/);
});

// ── 5. Ramas de las que dependen las conclusiones ──

test("ratio trabajo/descanso dentro del rango se marca normal", () => {
  const audit = auditAnalysis(
    soloInput({
      solo: {
        rhythm: { rhythm_detected: true, consistency: 0.9, frequency_rpm: 130 },
        intensity: { level: "moderate", score: 45, avg_speed_mps: 1.5 },
        movement: { pattern: "linear" },
        detailed: { work_rest_ratio: 3, rest_periods: 4, total_rest_s: 20 },
      },
    }),
  );

  const ratio = audit.findings.find((f) => f.key === "work_rest_ratio");
  assert.equal(ratio?.status, "normal");
  assert.match(ratio?.value ?? "", /3\.0:1/);
});

test("ratio trabajo/descanso bajo se marca fuera de rango", () => {
  const audit = auditAnalysis(
    soloInput({
      solo: {
        rhythm: { rhythm_detected: true, consistency: 0.9, frequency_rpm: 130 },
        intensity: { level: "moderate", score: 45, avg_speed_mps: 1.5 },
        movement: { pattern: "linear" },
        detailed: { work_rest_ratio: 1, rest_periods: 6 },
      },
    }),
  );

  assert.equal(audit.findings.find((f) => f.key === "work_rest_ratio")?.status, "bajo");
});

test("pausas sin ratio cuantificable se marcan sin referencia", () => {
  const audit = auditAnalysis(
    soloInput({
      solo: {
        rhythm: { rhythm_detected: true, consistency: 0.9, frequency_rpm: 130 },
        intensity: { level: "moderate", score: 45, avg_speed_mps: 1.5 },
        movement: { pattern: "linear" },
        detailed: { rest_periods: 3 },
      },
    }),
  );

  const ratio = audit.findings.find((f) => f.key === "work_rest_ratio");
  assert.equal(ratio?.status, "sin_referencia");
  assert.match(ratio?.value ?? "", /3 pausas/);
});

test("velocidad baja en ejercicio estacionario NO es un hallazgo negativo", () => {
  // Saltar la cuerda tiene desplazamiento horizontal bajo por diseño: marcarlo
  // como "falta de intensidad" sería el error original que se corrigió.
  const audit = auditAnalysis(
    soloInput({
      solo: {
        rhythm: { rhythm_detected: true, consistency: 0.9, frequency_rpm: 130 },
        intensity: { level: "moderate", score: 45, avg_speed_mps: 0.2 },
        movement: { pattern: "oscillating" },
      },
    }),
  );

  const speed = audit.findings.find((f) => f.key === "solo_avg_speed");
  assert.equal(speed?.status, "normal");
  assert.match(speed?.implication ?? "", /oscilatorio/);
});

test("velocidad alta en ejercicio con desplazamiento se marca alta", () => {
  const audit = auditAnalysis(
    soloInput({
      solo: {
        rhythm: { rhythm_detected: true, consistency: 0.9, frequency_rpm: 30 },
        intensity: { level: "high", score: 70, avg_speed_mps: 5 },
        movement: { pattern: "linear" },
      },
    }),
  );

  assert.equal(audit.findings.find((f) => f.key === "solo_avg_speed")?.status, "alto");
});

test("cuando muchas métricas secundarias faltan pero el ritmo sí se midió, la confianza baja a media", () => {
  // El ritmo SÍ se midió: no hay métrica crítica ausente, así que la confianza
  // no cae a "baja", pero faltan demasiadas otras para sentenciar.
  const audit = auditAnalysis(
    soloInput({
      solo: {
        rhythm: { rhythm_detected: true, consistency: 0.9, frequency_rpm: 130 },
        intensity: { level: "unknown", score: 0 },
        movement: { pattern: "unknown" },
      },
    }),
  );

  assert.ok(audit.coverage.unmeasurable >= 2, "intensidad y velocidad deben ser no medibles");
  assert.equal(audit.confidence, "media");
  assert.match(audit.confidenceReason, /parciales/i);
});

test("equipo con demasiados jugadores fantasma se marca bloque no evaluable", () => {
  const audit = auditAnalysis({
    sport: "futbol" as Sport,
    mode: "team",
    duration_s: 600,
    tracking: { summary: { total_players_detected: 2 } },
    sport_metrics: {
      player_count: 2,
      distance_per_player_m: 3000,
      ball_tracked_pct: 80,
      sprint_samples_pct: 12,
    },
  });

  const players = audit.findings.find((f) => f.key === "team_players");
  assert.equal(players?.status, "bajo");
  assert.match(players?.implication ?? "", /sistema táctico/);
});
