This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

Para un registro detallado de los cambios, consulte el [CHANGELOG.md](CHANGELOG.md).

## Procesamiento pesado (IA + Python): cola de trabajos y worker

Los análisis con modelo de visión (Gemini), la descarga de videos de YouTube (yt‑dlp) y
el pipeline deportivo completo (Python/YOLO/ffmpeg) no corren en Vercel (timeout de 60s
y sin binarios). Se implementa con una **cola de trabajos en Supabase**:

- **App (Vercel)**: los endpoints `POST /api/videos/[id]/detectar-deporte`, `/mejoras`, `/sports`
  y `/coach/report` encolan un job en la tabla `processing_jobs` y responden `{status:"queued"}`
  **solo cuando la variable de entorno `LENTE_PROCESSOR_QUEUE=1` está seteada**. Sin esa
  variable (desarrollo local) ejecutan directamente, como siempre.
- **Worker externo** (`npm run worker`): un script standalone (node + tsx) que corre en una
  máquina con `yt-dlp`, `ffmpeg-static`, Python y las API keys de IA. Pollea la cola,
  reclama el job más antiguo, descarga/procesa con los mismos módulos de `src/lib`
  (descarga YouTube → Storage → Gemini → pipeline Python), y escribe los resultados a
  Supabase Storage/DB (`data/sports-analysis/*.{json,ai.json}` → bucket `analyses`).
- **Frontend**: cuando una acción responde `queued`, los componentes
  (`AIInsightsPanel`, `SportsAnalysisViewer`) hacen polling al endpoint `GET` hasta que el
  resultado está `ready` (o `error`).

Cómo correr el worker local (desarrollador):

```bash
npm run dev            # la app en localhost:3000 (sin LENTE_PROCESSOR_QUEUE → modo directo)
npm run worker         # procesa la cola: descarga + IA + análisis Python
```

Para habilitar el modo cola en Vercel: definir `LENTE_PROCESSOR_QUEUE=1` en el proyecto y
correr `npm run worker` en la máquina del desarrollador mientras se procesan análisis.

> **v1 gratuita → opción paga**: esta v1 usa el worker en la máquina del desarrollador
> (gratis, sin exponer puertos). La misma tabla de cola y el mismo `scripts/worker/` se
> pueden desplegar después en un VPS/worker en la nube (opción paga) sin cambiar la lógica:
> el worker solo conoce Supabase por URL + service role.

## Roadmap de automatizaciones (backlog)

Mejoras de producto identificadas como oportunidades de automatización (no implementadas aún).
Prioridad según impacto/costo estimado para un equipo de 1 persona:

| Proceso | Esfuerzo | Costo est. | Ahorro/Ingreso | ROI | Prioridad |
|---|---|---|---|---|---|
| **Alta de alumnos por invitación** (token + magic link + trigger de vinculación) | Bajo | ~0 | 4 h/mes admin + conversión | <1 mes | P2 |
| **Push "análisis listo"** (Web Push API, VAPID free) | Medio | ~0 | Retención +25-40% | 1-2 meses | P1 |
| **Nudge por inactividad** (cron + push/recordatorio) | Bajo | ~0 | Retención marginal | 2-3 meses | P3 |
| **PWA offline** (manifest + caché de análisis, Background Sync para chat/análisis) | Medio | ~0 | Fricción en cancha | 2-3 meses | P2 |
| **Chatbot FAQ de operaciones** + encuesta de satisfacción post-informe | Medio | ~0 (Gemini integrado) | 6-8 h/mes soporte | 2 meses | P1 |
| **Auto-reintentos de análisis** | Bajo | ~0 | — | — | ✅ hecho |
| **Dashboard de operaciones** (jobs + re-trigger) | Bajo | ~0 | 2-4 h/mes | 1 mes | ✅ hecho |
| **Alerta por webhook (Telegram) en fallos** | Bajo | ~0 | Diagnóstico rápido | 1 mes | ✅ hecho |
| **Procesamiento en la nube** (worker → lambda/VPS GPU) | Alto | $50-150/mes | Desacopla del dev, escala | 3-6 meses | P1 |
| **Conciliación de suscripciones** (webhooks de pago, MRR → Sheets) | Medio | al integrar pago | 0 h cobranza | 2 meses | P3 |
| **Reporte de uso semanal automático** (RT/analytics + email) | Bajo | ~0 | Visibilidad del negocio | <1 mes | P2 |
| **Verificación de identidad / trial de 14 días** (magic link + check de suscripción) | Bajo | ~0 | 2 h/mes | <1 mes | P3 |

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
