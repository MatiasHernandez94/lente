# Mistakes to avoid / errors resolved

## 2026-10-14 — Python NameError due to missing constants (detect_players.py)
- **Error**: `NameError: name 'MAX_TRACK_MISSES' is not defined` at line 166 (default param). Second: `NameError: name 'MAX_PLAUSIBLE_MPS' is not defined` at line 402.
- **Root cause**: Commit 1a760ce introduced usage of constants in defaults and logic without defining them in the module.
- **Fix**: Added to Config section:
  - `MAX_TRACK_MISSES = 15` (~3s at 5fps before track moves to re-ID dead set)
  - `MAX_PLAUSIBLE_MPS = 12.0` (human max speed cap; identity jumps above this are filtered)
- **Verification**: `python3 -c "import detect_players; print('OK')"` passes; full pipeline end-to-end with `analyze_full.py` completes successfully; all Python files compile; 66/66 tests pass; `tsc --noEmit` clean.
- **Prevention**: Add import smoke test / py_compile in QA for Python modules, especially when changing tracker/config code.

## 2026-10-14 — Tracker con solo IoU fragmenta la identidad (detect_players.py)
- **Error**: un video de 8s con una persona saltando la cuerda reportaba **1339 "jugadores"** para 1131 frames.
- **Root cause**: `simple_tracker` matcheaba SOLO por IoU con umbral 0.3. Cuando el sujeto se mueve rápido (salto, sprint, dribling) el solapamiento entre frames cae del umbral, el match se rompe y se abre un ID nuevo casi cada frame.
- **Fix**: matching en dos pasadas — IoU primero, y para las detecciones no matcheadas un fallback por **proximidad** (distancia de centros ≤ 1.6× el lado mayor del bbox + ratio de tamaño ≥ 0.55). Resultado: 1339 → 11 tracks brutos, 8 personas reales.
- **Prevention**: al tocar tracking, verificar SIEMPRE la razón `total_players_detected / frames_processed`. Una razón ≈ 1.0 significa un ID por frame: el tracker está roto.

## 2026-10-14 — Falsos positivos estáticos detectados como personas (gimnasio con espejos)
- **Error**: un póster/reflejo con bbox de 96368 px aparecía como "una persona más" y **ganaba la elección de protagonista** sobre el sujeto real.
- **Root cause**: `is_plausible_person` solo filtra por forma (relación de aspecto, tamaño). Un cartel vertical pasa el filtro.
- **Fix**: `_is_artifact_track()` descarta tracks cuyo centro se mueve < 20 px Y cuyo coeficiente de variación de área es < 0.15. Una persona se mueve; un cartel no.
- **Prevention**: al elegir protagonista, exigir movimiento además de área de bbox. Un bbox grande y quieto es decorado.

## 2026-10-14 — `def` dentro de una función la corta antes del return (detect_players.py)
- **Error**: `AttributeError: 'NoneType' object has no attribute 'get'` en `analyze_full.py` al llamar `_detect_scene(tracking_data)`. `process_video` devolvía `None` pese a completar el procesamiento.
- **Root cause**: una edición insertó `def _is_artifact_track(...)` a nivel de módulo pero en medio del cuerpo de `process_video`, cortándola antes del `return output`.
- **Fix**: mover la función fuera, junto a los otros helpers de módulo.
- **Prevention**: tras editar Python, correr `python3 -c "import X; print(X.fn(...))"` o al menos `grep -n "^def " file` para verificar que cada función tiene su `return`. Un módulo que compila igual puede devolver None.

## 2026-10-14 — Check muerto tras refactor (solo_activity.py)
- **Error**: el análisis individual devolvía `activity_detected: false` con `reason: "no_person_detected"` en un video con 8 personas.
- **Root cause**: se dejó de popular `all_positions` al cambiar el loop, pero se mantuvo el check `if not all_positions: return ...`. La variable quedaba siempre vacía.
- **Fix**: cambiar el guard a `if not player_frames`.
- **Prevention**: al reemplazar el origen de datos de un guard, buscar otros usos de la variable vieja.

## 2026-10-14 — Aliasing por muestreo insuficiente (analyze_full.py)
- **Error**: el ritmo medido daba 278 "RPM" cuando el real era 139; la frecuencia detectada (4.6 Hz) superaba el techo de Nyquist del muestreo a 5 fps (2.5 Hz).
- **Fix**: `SOLO_MIN_SAMPLE_FPS = 12.0` — el modo individual fuerza `max(sample_fps, 12)` porque medir ritmo es medir una frecuencia.
- **Prevention**: si una métrica es una frecuencia, verificar que `sample_fps > 2 × frecuencia_máxima_esperada` antes de extraer conclusiones.

## 2026-10-14 — Frecuencia duplicada por medios ciclos (solo_activity.py)
- **Error**: `frequency_rpm` reportaba el doble del real (278 vs 139 RPM).
- **Root cause**: los cruces por cero son **medios** ciclos (subir y bajar = 2 cruces). Se calculaba `1/promedio_entre_cruces` en vez de `1/ciclo_completo`.
- **Fix**: `full_period = avg_half_period * 2` antes de derivar la frecuencia; exponer `half_cycle_period_s` para auditoría.
- **Prevention**: al convertir una serie a frecuencia, verificar si los eventos detectados son picos o cruces: los cruces por cero siempre duplican.

## 2026-10-14 — URL de video incorrecta: /api/files/ vs /api/media/
- **Error**: el video no se reproducía en la página de detalle ni en la de análisis deportivo.
- **Root cause**: las páginas construían `/api/files/${sourceRef}` pero la ruta real es `/api/media/[file]`.
- **Fix**: usar `/api/media/${encodeURIComponent(sourceRef)}` (patrón que ya usaban `VideoFrame`, `ScoutViewer`, `ExecutionViewer`).
- **Prevention**: al construir URLs a rutas propias, grepuear la ruta existente en vez de inventar el path.

## 2026-10-14 — Declaraciones duplicadas al editar TypeScript
- **Error**: `TS1117: An object literal cannot have multiple properties with the same name` y `Block-scoped variable 'solo' already declared` (TS2451).
- **Root cause**: al insertar código nuevo se duplicó `sport: "general"` junto al nuevo `sport`, y `const solo` apareció dos veces en la misma función.
- **Prevention**: tras editar, `grep -n "const <nombre> =" archivo` para detectar duplicados antes de buildear.

## 2026-10-14 — Orden de argumentos roto por reemplazo con regex (audit.ts)
- **Error**: la serialización compacta emitía la **implicación** en la columna del código de referencia.
- **Root cause**: un `re.sub` insertó `range.code` justo después de `deviationIn(...)`, que es la posición de `implication` en `finding(key, label, value, reference, status, deviation, implication, referenceCode)`.
- **Fix**: mover el argumento al final de la llamada; verificar con una salida real del serializador.
- **Prevention**: tras un reemplazo masivo de argumentos, imprimir el resultado de la función afectada antes de confiar en el build (el build no detecta argumentos desplazados si los tipos coinciden).

## 2026-10-14 — `server-only` bloquea la ejecución de scripts con tsx
- **Error**: `Error: This module cannot be imported from a Client Component module` al correr un script que importa `src/lib/coach/learnings.ts`.
- **Root cause**: el paquete `server-only` exporta un throw salvo bajo la condición `react-server`.
- **Fix**: mismo patrón que `scripts/worker/`: un `tsconfig.json` propio con `paths: { "server-only": ["./server-only.ts"] }` apuntando a un shim `export {}`, y correr con `TSX_TSCONFIG_PATH=<ruta> npx tsx <script>`. Además hay que cargar `.env.local` a mano (como `run-migrations.mjs`).
- **Prevención**: para todo script bajo `scripts/` que importe de `src/`, copiar el shim y el loader de env.

## 2026-10-14 — Top-level await no soportado en salida CJS de tsx
- **Error**: `ERROR: Top-level await is currently not supported with the "cjs" output format`.
- **Fix**: envolver en `async function main() { ... } main();` en vez de usar await a nivel de módulo.


