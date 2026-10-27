# LENTE — Bitácora

**Una línea:** Convierte el video de una práctica o partido en un informe técnico automático (IA + visión por computadora) para entrenadores y profesores de deporte.

## El problema

Hoy el entrenador graba la sesión y la analiza a ojo: cuántas acciones hubo, dónde se movieron los jugadores, cómo fue la carga física y qué errores se repitieron se estiman sin datos, y cada análisis lleva horas. LENTE procesa el video automáticamente y devuelve métricas reales (seguimiento de personas, eventos, táctica, fatiga) más un informe redactado con IA, listo para compartir con el alumno.

## Demo

- App: https://lente-six.vercel.app
- Acceso demo (sin contraseña): en `/login`, botones **"Admin · Profesor"** y **"Admin · Alumno"**.
- Con credenciales: `admin.profesor@lente.dev` / `lente-demo-2026` (y `admin.alumno@lente.dev`).

## Qué hace

- Subida de videos por archivo (a Storage) o desde YouTube.
- Detección automática del deporte con IA de visión (Gemini).
- Análisis deportivo con YOLOv8: seguimiento de personas, eventos, táctica, fatiga y biomecánica; heatmaps y clips.
- Métricas por deporte (fútbol, pádel, vóleibol, baloncesto, general) y modo individual (ritmo, saltos, descansos).
- Coach virtual con IA: chat sobre el video + informe de coach.
- Modo profesor: alta/asignación de videos a alumnos, panel de pendientes y consultas alumno↔profesor por video.
- OKRs y plan de ejecución del alumno.
- Panel de operaciones (estado de la cola + re-trigger de jobs).
- Alertas operativas por Telegram y health-check por cron.

## Stack

Next.js 16 (App Router · React 19 · TS · Tailwind v4) · Supabase (Postgres + Auth + Storage; tabla `processing_jobs` como cola) · Gemini API (`@google/genai`) · Python + YOLOv8/OpenCV/ffmpeg · **Vercel** (app + Cron) · **Railway** (worker del pipeline) · Telegram (alertas).

*(Reemplacé la pieza de automatización externa por Vercel Cron + Telegram. No uso pgvector: la recuperación del coach es por deporte + tipo de falla, no por similitud vectorial.)*

## Cómo correrlo

1. `npm install`
2. Copiar `.env.example` a `.env.local` y completar las variables
3. `node scripts/run-migrations.mjs` (aplica el esquema en Supabase)
4. `npm run dev` → app en `http://localhost:3000`
5. `npm run worker` en otra terminal (procesa la cola: descarga + IA + Python). En dev, sin `LENTE_PROCESSOR_QUEUE=1` la app procesa en línea.

Requisitos del worker: Python 3 (`ultralytics`, `opencv`, `scikit-learn`), `ffmpeg` (o `ffmpeg-static`) y `yt-dlp` para YouTube.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Conexión a Supabase desde el navegador |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anónima (cliente) |
| `SUPABASE_URL` | Conexión server-side |
| `SUPABASE_SERVICE_ROLE_KEY` | Acceso server (repo/Storage). Nunca al cliente |
| `DATABASE_URL` | Postgres para migraciones |
| `NEXT_PUBLIC_APP_URL` | URL pública (links de email) |
| `GEMINI_API_KEY` | IA de visión y texto (deporte, mejoras, coach, OKRs) |
| `LENTE_PROCESSOR_QUEUE` | `1` = encolar en `processing_jobs` (producción) |
| `LENTE_YOLO_MODEL` | Modelo YOLO (default `yolov8n.pt`) |
| `LENTE_DEMO_ADMIN` | `1` = habilita el login demo sin contraseña |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Alertas operativas |
| `CRON_SECRET` | Protege `/api/cron/health` |

## Decisiones técnicas

- **Supabase en vez de servicios separados:** un solo backend (Postgres + Auth + Storage) y la propia base funciona como cola (`processing_jobs`): no sumo Redis/SQS ni un servicio de archivos.
- **El análisis corre después de guardar, no antes:** el video se sube primero a Storage; el trabajo caro se dispara como job y la app hace polling. Si falla, el video no se pierde y el job se reintenta solo.
- **Cola + worker externo:** Vercel no puede correr Python/YOLO (timeout 60 s, sin binarios). La cola desacopla app y cómputo; el mismo worker corre local (gratis) o en Railway (24/7).
- **IA de visión "auto, una vez, con caché":** ejecutar Gemini en cada vista es caro y lento; se corre una vez, se cachea y la UI lo reusa.
- **`sample_fps=3` + `yolov8n`:** la inferencia es ~90% del tiempo; bajar fps y usar el modelo nano dio ~4x (354 s → 88 s) sin perder lo esencial.
- **Qué quedó afuera:** verificación de identidad/pagos, apps nativas, GPU en la nube y búsqueda semántica (no hace falta vector store).

## Próximos pasos ("algún día")

- Push "análisis listo" (Web Push, VAPID) — P1
- Procesamiento en la nube con GPU — P1
- Chatbot FAQ + encuesta post-informe (Gemini) — P1
- Alta de alumnos por invitación (token + magic link) — P2
- PWA offline — P2
- Reporte de uso semanal automático — P2
- Nudge por inactividad — P3
- Conciliación de suscripciones / verificación de identidad + trial — P3

Deuda técnica pendiente: dedupe de jobs por video, worker persistente y export a ONNX/OpenVINO.
