# Changelog — LENTE

Registro de cambios del proyecto LENTE (plataforma de análisis deportivo). Formato basado en
[Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/). Este proyecto sigue
[Semantic Versioning](https://semver.org/lang/es/).

> La feature de **seguimiento (scout)** con análisis pesado (ONNX + ffmpeg) está pensada para
> ejecutarse **en local** (`LENTE_RUN_SCOUT_LOCAL=1`). En Vercel (serverless) no puede correr el
> pipeline pesado, por lo que el panel de seguimiento está deshabilitado / limitado en producción.

---

## [No publicado]

### Añadido

- Cuatro visualizaciones nuevas en el seguimiento (scout), todas con datos reales (no mock):
  - **Selector de jugador**: dropdown en la cabecera para elegir entre los jugadores detectados; la
    sección de análisis se actualiza al cambiar de jugador.
  - **Mapa de calor** (`src/components/scout/HeatMap.tsx`): zonas más frecuentadas por un jugador
    dibujadas sobre la cancha (105 × 68), usando la homografía de calibración.
  - **Comparativa de jugadores** (`src/components/scout/KpiBars.tsx`): gráfico de barras de
    velocidad máxima y de distancia recorrida por cada jugador detectado.
  - **Asistente Técnico IA** (`src/components/scout/CoachAssistant.tsx`): maqueta de chat (sin
    funcionalidad todavía, campo de entrada deshabilitado).
- Curva de velocidad vs tiempo por jugador en el seguimiento (scout).
  - Nuevo componente `src/components/scout/SpeedChart.tsx` (SVG accesible, `role="img"`).
  - Muestra la velocidad instantánea (km/h) a lo largo del tiempo con un marcador vertical en el
    instante actual del video.
  - Los sprints (≥ 18 km/h) se resaltan en el color del equipo.
  - `ScoutViewer` muestra la gráfica del primer jugador asignado por defecto y cambia de jugador al
    hacer clic sobre uno en el video.

### Correcciones

- `instantSpeedAt` validaba solo la coordenada `x` de la homografía; ahora valida también `y`, lo
  que eliminaba valores `NaN` en la curva de velocidad.
- La curva de velocidad usaba `<polyline points>` con sintaxis de `<path>` (`M… L…`), lo que
  generaba un error de consola; ahora usa `<path d>`.

---

## [26354fa] — 2026-09-01

### Añadido

- Soporte de videos de **YouTube** en el seguimiento local.
  - El pipeline del scout (`runScoutPipeline`) resuelve el origen según `sourceType`:
    - `upload` / `camera` → lee de `data/uploads/{sourceRef}` (filesystem local).
    - `youtube` → descarga con `yt-dlp` (usa `--js-runtimes node` y el `ffmpeg-static` del
      proyecto).
  - Nuevas variables de entorno documentadas en `.env.example`:
    - `YT_DLP_PATH` — ruta al binario de `yt-dlp` (si no está en el `PATH`).
    - `LENTE_SCOUT_MAX_FRAMES` — límite de frames a analizar (0 = sin límite).
    - `LENTE_SCOUT_MAX_SECONDS` — límite de segundos a descargar de YouTube (0 = video completo).
  - Los errores reales de descarga/análisis se propagan como `error_message` visible en lugar de
    fallar silenciosamente.

### Correcciones

- `ytdlpPath()` devolvía `"yt-dlp"` sin comprobar la ruta real de pip (fallaba `spawn yt-dlp
  ENOENT`).
- La ruta de `ffmpeg-static` que Turbopack virtualizaba como `/ROOT/...` se resuelve ahora desde
  `process.cwd()` y se valida con `existsSync`.

### Scripts

- `scripts/scout-local-e2e.mjs` — flujo completo local con video subido.
- `scripts/scout-youtube-e2e.mjs` — flujo completo local con ejemplo de YouTube.
- `scripts/browser-debug.mjs` — diagnóstico de navegador (abre Chrome controlado).

---

## [f200662] — 2026-08-31

### Correcciones

- Se eliminó del proxy la rama `/login|/registro` → `/app` que causaba un **bucle de
  redirección** con cookies de sesión obsoletas (cuentas migradas de SQLite).
- Se corrigió un `<a>` anidado inválido en `AppShell` (el `<Logo>` ya renderizaba su propio `<a>`),
  que dejaba el panel en blanco por un error de hidratación.

---

## [335492a] — 2026-08-31

### Añadido

- Script de depuración Playwright del registro (`scripts/browser-debug.mjs`).

---

## [9a1de00] — 2026-08-31

### Correcciones

- Validación de sesión en el proxy/middleware para evitar el bucle de redirección con cookies
  obsoletas.

---

## [c8ec5c1] — 2026-08-31

### Infraestructura

- `.vercelignore` para excluir `data/` y `.next/` del deploy (límite de 100 MB de Vercel).

---

## [c36337e] — 2026-08-31

### Infraestructura

- Se eliminó `better-sqlite3` (migrado a Supabase) y se actualizó `.env.example` para la nube.

---

## [4eeeae5] — 2026-08-31

### Pruebas

- Smoke E2E de la API contra Supabase (7/7 PASS) y limpieza de datos de prueba.

---

## [7ec3adc] — 2026-08-31

### Añadido

- Modo local para subida/media (usar filesystem `data/uploads/` en vez de Supabase Storage por
  ahora); `/api/media/[file]` sirve los archivos con autenticación.

---

## [053edbf] — 2026-08-31

### Añadido

- Migración a **Supabase**: capa de repositorio/storage asíncrona y consumidores a `await`.

---

## [bd9a639] — (inicial)

### Añadido

- Plataforma de análisis deportivo **LENTE** (Next.js, App Router, React, TypeScript, Tailwind).

---

## Convenciones

- **Commit**: `tipo: descripción` (`feat`, `fix`, `chore`, `test`, `docs`).
- **Flujos de trabajo**:
  - Scout local: `LENTE_RUN_SCOUT_LOCAL=1 npm run dev`.
  - Pruebas e2e locales: `node scripts/scout-*.mjs` (requiere login/registro y videos de muestra).
