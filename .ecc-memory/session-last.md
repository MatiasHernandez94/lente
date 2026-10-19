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

## Worker de análisis en Railway (18/10)

La app vive en Vercel, pero el análisis deportivo (Python/YOLOv8) **no puede correr ahí**: no hay
Python ni disco persistente. Por eso existe la cola `processing_jobs` + worker externo.
**Sin worker corriendo, los jobs quedan `pending` para siempre** y la UI gira infinito.

Proyecto Railway: `talented-eagerness` (workspace "Matias Hernandez's Projects"), servicio `lente`,
auto-deploy desde GitHub `MatiasHernandez94/lente`. (Hay otro proyecto duplicado,
`endearing-ambition`, con un servicio `lente` — borrar para no gastar recursos.)

**Archivos de deploy (commit `c5c2194`):**
- `Dockerfile`: node:22-bookworm-slim + python3 venv + `torch`/`torchvision` **CPU**
  (`--index-url https://download.pytorch.org/whl/cpu`, evita ~2 GB CUDA) + `pip install -r
  scripts/sports/requirements.txt` + `npm ci` + pesos YOLO pre-descargados con curl a
  `scripts/sports/` (el código los busca en el cwd).
- `scripts/sports/requirements.txt`: ultralytics, opencv-python-headless, scikit-learn, yt-dlp.
- `railway.json`: builder Dockerfile, `startCommand: npm run worker`, 1 réplica, restart ON_FAILURE.
- `.dockerignore`: excluye `node_modules`, `data`, `.git`, `.env*`, `*.pt`.

**Env vars en Railway** (seteadas con `railway variable set ... --skip-deploys`): `SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
`LENTE_PROCESSOR_QUEUE=1`, **`LENTE_SPORTS_WORKER=0`**.

**Dos bugs encontrados:**
1. `LENTE_SPORTS_WORKER=1` (worker Python persistente) **colgaba** el job: `worker.py` devolvía el
   resultado sin el `requestId`, y el cliente Node (`src/lib/sports/service.ts:218`) sólo resuelve el
   promise si el mensaje trae `requestId`. Fix en `scripts/sports/worker.py` (echo del `requestId`).
   Nunca se había probado porque local el flag no está seteado. Igual se dejó el flag en `0`.
2. **No hay dedupe de jobs por video**: clickear "analizar" varias veces encola varios jobs para el
   mismo video (había 2-3 duplicados del mismo). Se limpiaron a mano. Convendría dedupe en
   `enqueueProcessingJob`.

**Rendimiento:** el contenedor Railway tiene 2 vCPU/1 GB y `CPU_USAGE ~2.5` (throttle a 2.0). Un video
de ~10 min (3109 frames a 5 fps) tardó **~15 min** vs ~2 min local. Para acelerar: subir plan, bajar
`sample_fps`, o reusar el worker persistente (ya arreglado).

**Tuning gratis aplicado (commit `c13b778`)** — 4x más rápido, medido:
- Default `sample_fps` 5 → **3** (`src/lib/validation/api.ts` `sportsOptionsSchema` + fallback en
  `src/lib/sports/service.ts`). Solo aplica a deportes de equipo: en `analyze_full.py` el modo solo
  fuerza `max(sample_fps, 12)`.
- Modelo **`yolov8n` (nano)** en vez de `yolov8s`: `ENV LENTE_YOLO_MODEL=yolov8n.pt` en el Dockerfile
  (y variable en Railway) + `yolov8n.pt` pre-descargado con curl.
- Medición (mismo video): **354 s (fps5+yolov8s) → 88 s (fps3+yolov8n)**. La inferencia es el 0–90%
  del job; eventos/táctica/fatiga corren sobre el tracking y son rápidos.
- Para ir más rápido todavía: GPU (Modal/RunPod/Replicate, ~30–60 s, pago por uso) o más vCPU
  (rendimiento sublineal). ONNX Runtime/OpenVINO e `imgsz` menor son optimizaciones gratis pendientes.

**Verificado end-to-end:** job `sports` → `processing` con progreso (`payload.progress.pct`) → `done`;
JSON de 5.28 MB (`tracking`, `events`, `tactical`, `fatigue`) persistido en el bucket `analyses` y
leído por la app.

**Comandos:**
- Login/link: `railway login` → `railway link -p talented-eagerness -e production -s lente`.
- Setear vars desde `.env.local`: `set -a; source .env.local; set +a` y `railway variable set
  "KEY=$KEY" --skip-deploys`.
- Logs: `railway logs -d` / build `railway logs -b`; métricas: `railway metrics --cpu --memory`.
- **Cuidado:** cualquier push dispara un redeploy que reinicia el contenedor y mata el job en curso.
