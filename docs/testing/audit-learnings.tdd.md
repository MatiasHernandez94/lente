# Evidencia TDD — auditoría y memoria de aprendizajes

**Fecha:** 2026-10-14
**Runner detectado (Step 0):** Node `node:test` nativo con `--experimental-strip-types`.
Sin jest/vitest/bun (no hay config de ninguno). `scripts.test` de package.json:
`node --experimental-strip-types --test "src/**/*.test.ts"`.
El detector `scripts/setup-package-manager.js` de ECC no existe en el repo.

**Plan de origen:** no se usó `*.plan.md`. Los journeys se derivaron del pendiente #2
de `.ecc-memory/session-last.md`: los 66 tests pasaban pero ninguno cubría
`src/lib/analysis/audit.ts` ni `src/lib/coach/learnings.ts`.

---

## 1. User journeys

| # | Journey |
|---|---|
| J1 | Como usuario, quiero que la auditoría me diga honestamente cuando una métrica quedó fuera de rango o no se pudo medir, para saber cuánto confiar en el análisis. |
| J2 | Como usuario con un video corto, no quiero que me comparen contra estándares de partido completo, porque genera hallazgos falsos. |
| J3 | Como usuario, quiero que las métricas sin estándar universal se presenten crudas, no inventadas. |
| J4 | Como usuario, quiero que el veredicto del agente no pueda afirmar más confianza de la que permiten los datos. |
| J5 | Como usuario, quiero que mis aprendizajes no se filtren a otra cuenta. |
| J6 | Como usuario, quiero que el negativo se guarde como restricción y el positivo como ajuste validado. |
| J7 | Como usuario, quiero que el análisis no gaste tokens de más en datos que el modelo ya puede interpretar. |

---

## 2. Reporte por tarea

### T1 — Bug: `toNumber` destruía la etiqueta cualitativa

- **Resumen:** la serialización compacta colapsaba `"estable (-6%)"` a `-6`.
- **RED:** `el compacto no destruye la etiqueta cualitativa de la tendencia` falló —
  el valor llegaba como número, sin la palabra.
- **GREEN:** `toNumber` ahora solo numera valores que **empiezan** con un número
  (`/^\s*(-?\d+(?:[.,]\d+)?)/`). `"139 rep/min"` → `139`; `"estable (-6%)"` queda como está.
- **Garantiza:** "ritmo estable" y "ritmo en descenso" con el mismo porcentaje ya no son
  indistinguibles para el modelo.
- **Por qué importa:** son conclusiones opuestas (normal vs. fatiga).

### T2 — Bug: los buckets de `coverage` no cerraban

- **Resumen:** `normal + fuera_de_rango + no_medibles` no sumaba `audited`.
- **RED:** `una métrica fuera de rango queda en issues` falló con
  `coverage.out_of_range=1` vs. `3` calculado.
- **GREEN:** se agrega la categoría `sin_referencia` y un assert que lanza si las
  cuatro no suman el total.
- **Garantiza:** si se agrega un estado nuevo a `AuditStatus` y no se cuenta, la suite
  falla en vez de silenciar el desajuste.

### T3 — Bug: `rating >= 0` era un no-op

- **Resumen:** los aprendizajes que el usuario marcó como "no sirvió" no se descartaban.
- **RED:** `un aprendizaje con rating negativo se descarta` falló.
- **GREEN:** el filtro pasa a `rating == null || rating > 0`.
- **Garantiza:** un aprendizaje con feedback negativo deja de inyectarse.

### T4 — Bug: orden de universales invertido

- **Resumen:** los aprendizajes sin tipo de falla salían **últimos**, cuando la intención
  declarada era que fueran primeros.
- **RED:** `sin tipo conocido, los universales van antes que los etiquetados` falló.
- **GREEN:** `Number(a.errorType != null) - Number(b.errorType != null)`.
- **Garantiza:** sin saber el tipo de falla (se recupera antes de clasificar), van
  primero los que aplican a cualquier caso.

### T5 — Refactor: lógica pura extraída a `learnings-core.ts`

- **Resumen:** `rankLearnings`, `buildLearningText`, `formatLearningsForPrompt` y los
  pesos de origen vivían dentro de funciones que importan `@/lib/db`.
- **RED:** `learnings-core.test.ts` no compilaba — `ERR_MODULE_NOT_FOUND`. Y
  `learnings.ts` es **intesteable** con `node:test`: `@/lib/db` no resuelve el alias,
  `db.ts` tiene `import "server-only"` que lanza, y `getClient()` exige credenciales de
  Supabase.
- **GREEN:** módulo nuevo sin imports en runtime. `learnings.ts` queda como capa de I/O.
- **Garantiza:** la decisión pura es testeable sin base de datos ni credenciales.
- **Verificación de no-regresión:** `seed-learnings.ts` se corrió después del refactor:
  0 insertados (idempotente) y sigue recuperando 2 aprendizajes para `general`.

### T6 — Bug: el glob de tests ignoraba rutas nuevas

- **Resumen:** `npm test` reportaba 66 tests con los archivos nuevos presentes en disco.
- **RED:** `npm test` → 66; los archivos existían en `src/lib/analysis/` y `src/lib/coach/`.
- **GREEN:** glob a `"src/**/*.test.ts"` (Node hace el glob, no el shell). → 89 tests.
- **Garantiza:** un test agregado fuera de `execution/` corre en la suite. Un test que no
  corre es peor que no tenerlo.

---

## 3. Especificación de tests

| # | Qué garantiza | Archivo:test | Tipo | Resultado | Evidencia |
|---|---|---|---|---|---|
| 1 | Métrica fuera de rango aparece en `issues` con implicación | `audit.test.ts:una métrica fuera de rango…` | unit | PASS | `npm test` |
| 2 | Sin sujeto detectable el ritmo se declara no medible y no se fabrica cadencia | `audit.test.ts:sin sujeto detectable…` | unit | PASS | `npm test` |
| 3 | Confianza ALTA con medición buena aunque el resultado sea malo | `audit.test.ts:la confianza es ALTA…` | unit | PASS | `npm test` |
| 4 | Video corto no se compara contra el partido completo | `audit.test.ts:un video corto no se compara…` | unit | PASS | `npm test` |
| 5 | Partido completo sí usa la referencia de 800 m | `audit.test.ts:un partido completo sí…` | unit | PASS | `npm test` |
| 6 | Video de segundos se marca como fragmento corto | `audit.test.ts:un video de segundos…` | unit | PASS | `npm test` |
| 7 | Métricas sin referencia universal quedan crudas, sin desviación | `audit.test.ts:las métricas sin referencia…` | unit | PASS | `npm test` |
| 8 | El compacto no destruye la etiqueta cualitativa | `audit.test.ts:el compacto no destruye…` | unit | PASS | `npm test` |
| 9 | El compacto sí numera número + unidad | `audit.test.ts:el compacto sí numera…` | unit | PASS | `npm test` |
| 10 | El compacto declara su formato | `audit.test.ts:el compacto declara el formato…` | unit | PASS | `npm test` |
| 11 | El verboso incluye implicación y confianza | `audit.test.ts:el verboso incluye…` | unit | PASS | `npm test` |
| 12 | Ratio trabajo/descanso normal | `audit.test.ts:ratio trabajo/descanso dentro…` | unit | PASS | `npm test` |
| 13 | Ratio trabajo/descanso bajo | `audit.test.ts:ratio trabajo/descanso bajo…` | unit | PASS | `npm test` |
| 14 | Pausas sin ratio cuantificable | `audit.test.ts:pausas sin ratio…` | unit | PASS | `npm test` |
| 15 | Velocidad baja en ejercicio estacionario NO es negativa | `audit.test.ts:velocidad baja en ejercicio…` | unit | PASS | `npm test` |
| 16 | Velocidad alta con desplazamiento | `audit.test.ts:velocidad alta…` | unit | PASS | `npm test` |
| 17 | Confianza media sin métrica crítica ausente | `audit.test.ts:cuando muchas métricas secundarias…` | unit | PASS | `npm test` |
| 18 | Equipo con pocos jugadores: bloque no evaluable | `audit.test.ts:equipo con demasiados…` | unit | PASS | `npm test` |
| 19 | Aprendizaje de otro usuario no se inyecta | `learnings-core.test.ts:un aprendizaje de usuario…` | unit | PASS | `npm test` |
| 20 | Sin usuario solo se ven los curados | `learnings-core.test.ts:sin usuario identificado…` | unit | PASS | `npm test` |
| 21 | Rating negativo se descarta | `learnings-core.test.ts:un aprendizaje con rating…` | unit | PASS | `npm test` |
| 22 | Tipo de falla conocido manda la coincidencia | `learnings-core.test.ts:con tipo de falla conocido…` | unit | PASS | `npm test` |
| 23 | Sin tipo conocido, universales primero | `learnings-core.test.ts:sin tipo conocido…` | unit | PASS | `npm test` |
| 24 | Se respeta el límite de inyectados | `learnings-core.test.ts:respeta el límite…` | unit | PASS | `npm test` |
| 25 | Orden de pesos de origen | `learnings-core.test.ts:el peso del origen…` | unit | PASS | `npm test` |
| 26 | Negativo con corrección = restricción | `learnings-core.test.ts:el feedback negativo con corrección…` | unit | PASS | `npm test` |
| 27 | Negativo sin corrección = restricción | `learnings-core.test.ts:el feedback negativo sin corrección…` | unit | PASS | `npm test` |
| 28 | Positivo = ajuste validado | `learnings-core.test.ts:el feedback positivo…` | unit | PASS | `npm test` |
| 29 | Sin aprendizajes el bloque va vacío | `learnings-core.test.ts:sin aprendizajes…` | unit | PASS | `npm test` |
| 30 | Con aprendizajes, aclara que solo aplican los que corresponden | `learnings-core.test.ts:con aprendizajes…` | unit | PASS | `npm test` |
| 31 | El glob de `npm test` descubre tests fuera de `execution/` | cambio en `package.json` | config | PASS | ver T6 |

---

## 4. Cobertura y huecos conocidos

Comando: `node --experimental-strip-types --test --experimental-test-coverage "src/**/*.test.ts"`

```
ℹ    audit.ts            |  99.33 |    80.15 |   100.00 | 249-252
ℹ    learnings-core.ts   | 100.00 |    92.86 |   100.00 |
ℹ all files              |  93.84 |    84.04 |    91.30 |
```

Supera el umbral de 80% en líneas, ramas y funciones, tanto por archivo como global.

**Hueco intencional:** `audit.ts` líneas 249-252 — el `throw` de coherencia de buckets.
Es un assert defensivo: solo se alcanzaría si se agrega un estado nuevo a `AuditStatus`
sin clasificarlo, que es justamente lo que el assert existe para detectar. No se testea
porque hacerlo requeriría falsificar datos internos del módulo.

**No cubierto (pendiente):**
- `learnings.ts` (capa de I/O contra Supabase): requiere mock del cliente o una base de
  prueba. La lógica ya está cubierta vía `learnings-core.ts`.
- `clampConfidence` en `gemini.ts` sigue siendo privada: el techo de confianza es una
  garantía importante y no tiene test unitario directo. Se ejerce solo por Integration
  con el modelo real.
- El ciclo IA completo (auditoría → veredicto → informe) no se ejecutó contra Gemini en
  esta sesión; ver pendiente #1 de `session-last.md`.

---

## 5. Commits checkpoint (en la rama activa, secuencia de esta tarea)

| Commit | Etapa | Evidencia |
|---|---|---|
| `93520f2` | RED | tests agregados y ejecutados: audit 7 pass/4 fail, learnings-core no compilaba |
| `9cc2bf0` | GREEN | 89 pass / 0 fail; 3 bugs corregidos; lógica pura extraída; glob arreglado |
| `115e4fd` | Cobertura | audit.ts ramas 71.5% → 80.15%; 96 tests, 0 fail |

No se squashearon. Todos alcanzables desde `HEAD` en `main`.
