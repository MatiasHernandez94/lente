# Architecture decisions

## Tracker robustness (detect_players.py)
- **Track retention**: Use `MAX_TRACK_MISSES = 15` (samples at processing fps, default 5fps) to tolerate ~3s of occlusion before marking tracks dead and considering re-ID.
- **Plausibility filtering**: Cap instantaneous speed at `MAX_PLAUSIBLE_MPS = 12.0` m/s to discard association errors/identity swaps that produce unrealistic jumps; such segments don't contribute to distance totals.
- **Re-ID window**: Keep `REID_MAX_SAMPLES = 120` (~24s at 5fps) as the time window to re-encounter a "dead" track with similar jersey color/position. This reduces ID fragmentation without over-merging across long gaps.

## Matching del tracker: IoU + proximidad (no solo IoU)
- **Decisión**: `simple_tracker` hace dos pasadas. Primero IoU con umbral 0.3 (asociación fiable cuando hay solapamiento). Después, para las detecciones que nadie capturó, un fallback por **proximidad**: distancia de centros ≤ `PROXIMITY_RANGE = 1.6` × lado mayor del bbox, con `PROXIMITY_MIN_SIZE_RATIO = 0.55` de similitud de tamaño.
- **Por qué**: IoU puro se rompe con movimiento rápido y fragmenta al sujeto en un ID por frame. El fallback por proximidad mantiene la identidad.
- **Riesgo aceptado**: en escenas muy pobladas podría haber intercambio de identidad entre personas próximas. Se mitiga porque el fallback solo actúa cuando IoU no encontró match válido, y exige tamaño comparable.

## Filtro de tracks fantasma y artefactos (detect_players.py)
- El resumen reporta `total_players_detected` = personas **reales** (filtradas), y expone `raw_tracks_detected` + `ghost_tracks_filtered` para que sea auditable cuánto se descartó.
- Criterio de "persona real": vida útil ≥ `max(4, 3% de los frames muestreados)`, presencia sostenida, y no ser un artefacto estático.
- **Protagonista** (modo individual): el de mayor `frames_seen × (1 + área_media/100000)`. Se pondera presencia y área para que alguien parado al fondo no le gane al sujeto que se ejercita.
- **Por qué**: sin esto el resumen contaba 1339 "jugadores" y un póster ganaba la elección de protagonista.

## Muestreo diferenciado por modo (analyze_full.py)
- Modo individual: `sample_fps = max(solicitado, 12)`. Medir ritmo es medir una frecuencia, y a 5 fps el techo de Nyquist (2.5 Hz) aliasaba el resultado.
- Modo equipo: mantiene el `sample_fps` solicitado (default 5) porque sus métricas no dependen de la resolución temporal y prioriza velocidad de procesamiento.

## Deporte primero, modo después
- El deporte se elige **antes** de subir el video (`VideoUploadZone`, paso 01) y viaja como contexto al pipeline. `general` ⇒ modo `solo` siempre.
- El modo **no** se auto-deduce del conteo de personas en escena: un gimnasio con gente de fondo no es un deporte de equipo.
- Cada deporte declara jugadores esperados, etiqueta y nota de unidad para que las métricas se interpreten en contexto.

## Payload de frames: opcional, no por defecto
- `getSportAnalysis(videoId, { includeFrames })`. Por defecto **no** devuelve `frames[]` (multi-MB de ruido para todo lo que no sea el overlay de video). El overlay lo pide con `?include=frames`.
- **Por qué**: la respuesta llegaba a ~5 MB por análisis y se enviaba a clientes que nunca la usaban.

## Auditoría determinista + veredicto IA (dos responsabilidades separadas)
- `src/lib/analysis/audit.ts` resuelve el "paso 2" (comparar contra rangos) **sin IA**. Es aritmética: hacerla con un modelo encarece y enlentece sin ganar nada, y pierde auditabilidad.
- El modelo solo resuelve lo que requiere juicio: clasificar el tipo de falla y elegir la corrección más crítica (`gemini.ts: auditAnalysis`).
- El veredicto se persiste en `{videoId}.ai.json` como `motor_audit` y se le pasa a la pasada 2 (informe del coach), que lo desarrolla en vez de re-razonarlo.
- Si la pasada 1 falla, la pasada 2 se genera igual razonando desde las métricas: la auditoría determinista se guarda de todas formas.

## Memoria de aprendizajes: SQLsimple, no vector store
- Tabla `coach_learnings` (migración 0019) con índice compuesto `(origen, sport, error_type)`. La recuperación es un `WHERE`, no una búsqueda semántica.
- **Por qué no vector DB**: la dimensión en la que un aprendizaje aplica es deporte + tipo de falla, que es exactamente un índice. Un vector store agregaría infraestructura, sincronización y modos de falla para resolver algo que SQL resuelve.
- Aislamiento estricto: `curado` = global; `usuario`/`negativo` = solo del dueño. Verificado con un segundo usuario que recibe 0.
- Feedback binario (pulgar) en vez de escala 1-5: una escala de 5 sobre una corrección individual genera casi todo 3s y 4s, que no separan nada.

## Prompt de visión: mosaico + datos compactos
- 4 fotogramas en un mosaico 2×2 (ffmpeg `tile`) y métricas/auditoría en formato `[key, valor, estado, ref]`, en lugar de prosa en español.
- Medido conjuntamente: -42% de payload base64 y -54% de tokens en el bloque de auditoría.
- El razonamiento del modelo se guarda como campo estructurado (`discarded`), **no** como bloque `<razonamiento>` en texto: `extractJson()` devuelve `null` si hay texto antes del JSON y el job falla.


