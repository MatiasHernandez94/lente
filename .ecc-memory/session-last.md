# Última sesión — 2026-10-14

## Qué se estaba haciendo

Cadena de mejoras sobre el análisis deportivo de video, partiendo de la queja de que los KPIs
"decían cualquier boludez" en un video de saltar la cuerda. El hilo fue: (1) encontrar por qué el
tracker reportaba 1339 jugadores, (2) hacer que el deporte se elija primero y gobierne el análisis,
(3) reemplazar métricas inventadas por métricas medibles y honestas, (4) pasar el agente IA a dos
pasadas con memoria de aprendizajes, (5) bajar el consumo de tokens.

## Estado actual: **completo y verificado**

Build OK · lint sin problemas en archivos tocados · 66/66 tests · migración 0019 aplicada ·
aprendizajes curados sembrados (5).

### Hecho

| Área | Cambio |
|---|---|
| Tracker | matching IoU + fallback por proximidad; filtro de artefactos estáticos; resumen con `ghost_tracks_filtered` |
| Escala | calibración por altura del sujeto (1.70 m de referencia) en vez de "ancho del frame = cancha" |
| Muestreo | 12 fps forzado en modo individual (anti-aliasing de Nyquist) |
| Contexto | deporte antes de subir el video; `general` ⇒ modo `solo` siempre |
| Payload | `frames[]` fuera de la API salvo `?include=frames` |
| Agente IA | pasada 1 (auditar → clasificar → elegir UNA) + pasada 2 (informe desarrolla el veredicto) |
| Memoria | tabla `coach_learnings`, feedback del usuario, 5 curados sembrados |
| Tokens | mosaico 2×2 con ffmpeg `tile` (-42% payload), métricas/auditoría compactas (-54%) |
| UI | `VideoUploadZone` (deporte primero), `ActionableReport` (corrección prioritaria + calidad de datos), `FeedbackControls` |

## Pendiente para la próxima sesión

1. **Probar el ciclo IA end-to-end con una llamada real a Gemini.** La auditoría determinista, el
   mosaico y la serialización compacta están verificadas a nivel de datos y payload, pero ninguna se
   ejecutó contra el modelo. Lo que hay que mirar: que el modelo lea bien el mosaico (no lo interprete
   como una escena con gente duplicada) y que respete el JSON con el veredicto.
2. **Tests para el código nuevo.** Los 66 tests pasan pero ninguno cubre `src/lib/analysis/audit.ts`
   ni `src/lib/coach/learnings.ts`. Casos mínimos: rango `bajo/normal/no_medible`, referencia
   escalada a la duración, `clampConfidence`, y el aislamiento por usuario en `getRelevantLearnings`.
3. **`FEW_SHOT_MEMORIA_DINAMICA` completo.** La base existe (recuperar + inyectar + feedback). Lo que
   falta es recuperar **después** de clasificar el error, para priorizar aprendizajes del tipo de falla
   detectado en vez de solo los universales.
4. **Deuda de lint preexistente**: 10 errores en `src/lib/execution/geom.test.ts` (uso de `any`).
   Ajenos a este trabajo, pero rompen `npm run lint`.

## Para retomar

```bash
node scripts/run-migrations.mjs                                    # por si hay migración nueva
TSX_TSCONFIG_PATH=scripts/tools/tsconfig.json \
  npx tsx scripts/tools/seed-learnings.ts                          # sembrar curados (idempotente)
npm run dev
```

El video de prueba usado para todo el desarrollo fue
`data/uploads/0ec29bf7-84ca-4acc-9c57-af90ef4c2e01.mp4` (gimnasio, 576×1024 portrait, 3 personas en
cuadro, una saltando la cuerda). Sirve como caso representativo de "actividad individual con gente
de fondo", que es el que rompía el análisis.
