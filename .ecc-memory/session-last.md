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
2. **`FEW_SHOT_MEMORIA_DINAMICA` completo.** La base existe (recuperar + inyectar + feedback). Lo que
   falta es recuperar **después** de clasificar el error, para priorizar aprendizajes del tipo de falla
   detectado en vez de solo los universales.
3. **`clampConfidence` no tiene test unitario.** Sigue privada en `gemini.ts`. El techo de confianza
   es una garantía importante y hoy solo se ejerce contra el modelo real.
4. **Deuda de lint preexistente**: 10 errores en `src/lib/execution/geom.test.ts` (uso de `any`).
   Ajenos a este trabajo, pero rompen `npm run lint`.

## Cerrado en esta sesión (TDD)

Pendiente #2 de la sesión anterior (tests para `audit.ts` y `learnings.ts`): **hecho**.
Evidencia completa en `docs/testing/audit-learnings.tdd.md`.

- 31 tests nuevos. Suite: 66 → **96 tests**, todos en verde.
- Runner: `node:test` nativo. El glob de `npm test` estaba fijado a `src/lib/execution/`, así que
  los tests en rutas nuevas **no corrían** (reportaba 66 con los archivos en disco). Ahora usa
  `"src/**/*.test.ts"`.
- 4 bugs reales encontrados por los tests, no por lectura:
  1. `toNumber` colapsaba `"estable (-6%)"` a `-6`, borrando la etiqueta cualitativa.
  2. Los buckets de `coverage` no sumaban `audited` (faltaba `sin_referencia`).
  3. `rankLearnings`: el filtro `rating >= 0` era un no-op, dejaba pasar los aprendizajes que el
     usuario marcó como "no sirvió".
  4. `rankLearnings`: el orden de universales estaba invertido, salían últimos.
- La lógica pura se extrajo a `src/lib/coach/learnings-core.ts` (sin imports en runtime) porque
  `learnings.ts` era **intesteable**: importa `@/lib/db`, que `node:test` no resuelve, más
  `server-only` (lanza al importar) y `getClient()` exigiendo credenciales de Supabase.
- Cobertura: `audit.ts` 80.15% ramas / 99.33% líneas; `learnings-core.ts` 92.86% / 100%.

**Lección de proceso:** el glob de tests fijado a un directorario es una trampa silenciosa. Un test
que no corre en la suite da la misma señal (verde) que no tenerlo.

## Para retomar

- La tabla `consultas` y las rutas `GET/POST /api/videos/[id]/consulta` + bandeja `/api/profesor/consultas-pendientes` están en verde (106 tests OK, build OK).
- El QA completo (`scripts/tools/qa-consultas.ts`) pasa 28/28 (incluye notificaciones y limpieza).
- Pendientes: el coach flotante usa `top-[calc(var(--header-height,4rem)+1.25rem)]`; validar en móvil si el header ocupa 4rem o más.
- Siguiente revisión: ciclo IA end-to-end con Gemini real, `FEW_SHOT_MEMORIA_DINAMICA` recuperación post-clasificación, test `clampConfidence`, y deuda lint `geom.test.ts`.


## Deploy a Vercel (18/10)

Problema: el deploy remoto (`vercel --prod`) falló con
`No more than 12 Serverless Functions ... on the Hobby plan`. La app tiene 32 route handlers.

**Lo que resolvió:**
1. Faltaban `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en las env vars de Vercel
   (solo estaban en `.env.local`). El cliente browser (`src/lib/supabase/client.ts`) las necesita
   inyectadas en el bundle → la UI tiraba "NEXT_PUBLIC_SUPABASE_URL no está configurada".
   Se agregaron a Production con `vercel env add`.
2. `vercel build --yes --prod` + `vercel deploy --prebuilt --prod` **desplegó sin tocar el conteo
   de funciones**. Ese camino no aplica el límite de 12.
3. El prebuilt falló primero con `ENOENT ... data/uploads/...mp4`: Next trazaba los videos locales
   dentro de las funciones porque `video-agent.ts` resuelve `data/uploads` dinámicamente, y `data`
   está en `.vercelignore`. Se arregló con `outputFileTracingExcludes: { "/*": ["data/**/*"] }` en
   `next.config.ts`.
4. Después de eso, los deploys por git (push a `main`) también quedaron `Ready`.

**Ojo:** el build local de `vercel` necesita las env de producción. `vercel pull` deja `[SENSITIVE]`
como placeholder en los secretos; para buildear local hay que reemplazarlos (se hizo parcheando
`.vercel/.env.production.local`, que está gitignoreado).

Se borró `src/app/api/extraer-pendientes` (sin uso) para bajar una función.
