# Patterns discovered

- **Missing constants cause full import failures in Python modules**: If a function uses a constant as a default parameter but the constant is defined later or not at all, importing the module fails with `NameError`. Verify all referenced constants exist at import time.
- **Config block discipline**: Group related constants (tracker params, thresholds, plausibility caps) together in a single Config section to make it easier to spot omissions.
- **Graceful Python error surfacing**: API routes that spawn Python scripts wrap errors via `serializeError` and log context; however, early import errors may be concise (NameError). Always run a quick `python3 -m py_compile` and a minimal import test when touching core modules.

## Calibración de escala por altura de persona
- Cuando no hay homografía de cancha, la escala metros/pixel se deriva de la **altura del bbox del propio sujeto**: `m/px = 1.70 / mediana(altura_bbox)`. Una persona mide ~1.70 m, así que su bbox da la escala sin necesidad de conocer la cancha.
- Publicar junto a la escala el campo `confidence` (`"good"` si la variación de altura es < 35%, `"approx"` si no) y un `speed_basis`, para que la UI pueda decir "aproximado" en vez de presentar 24.9 cm como exacto.
- **No** usar el ancho del frame como referencia de cancha salvo que el encuadre efectivamente contenga el ancho completo: en un video vertical de 576×1024 inventa velocidades de 11 m/s.

## Deporte declarado gobierna el modo de análisis
- Un perfil por deporte (`sport_profile.py`) define `mode`, jugadores esperados, etiqueta y nota. El modo **no** se auto-deduce del conteo de personas: un gimnasio con 2 personas de fondo no es un deporte de equipo.
- `general` es siempre individual; el análisis se centra en el **sujeto protagonista** (mayor presencia × área media de bbox), ignorando al resto.
- Cada métrica declara si se pudo calcular; si no, se reporta la limitación en vez de inventar el valor.

## Auditoría determinista antes del juicio del modelo
- Comparar una métrica contra un rango de referencia es aritmética: se resuelve en TypeScript (`src/lib/analysis/audit.ts`) sin gastar llamada de IA. El modelo solo juzga (clasificar el error, elegir la corrección).
- Una métrica **sin estándar universal** se marca `sin_referencia` y se pasa cruda, en vez de compararla contra un número inventado (la cadencia de 139 RPM o la amplitud de 25 cm dependen del ejercicio).
- Referencias sensibles a la duración: comparar 11 m contra "≥800 m de un partido" sobre un clip de 8s genera un falso hallazgo. Escalar la expectativa a la duración real (`>=1` m) y avisar que es un fragmento.
- Separar dos dimensiones que se confunden: **confianza** (¿se pudo medir?) vs **hallazgo** (¿el resultado es bueno?). Una consistencia de 69% se midió bien: la confianza es alta, el hallazgo es el problema.

## Confianza con techo en el flujo IA
- `clampConfidence(veredicto, auditoría)`: la confianza del modelo nunca supera la de la auditoría determinista. Si no se pudo medir el ritmo, el modelo no puede estar "seguro" de algo que dependa de él.
- Si una métrica es `NO MEDIBLE`, el prompt prohíbe explícitamente concluir sobre ella.

## Serialización compacta de datos para prompts
- Enviar `[key, valor, estado, ref_code]` en vez de prosa en español. Las implicaciones son hechos que el pipeline ya calculó; explicarlas en cada llamada gasta tokens sin dar información nueva al modelo.
- Rangos como códigos cortos (`">=.85"`, `">=-20"`, `".3..4"`) porque el texto largo del rango se repetía en cada hallazgo sin aportar.
- Medido: auditoría verbosa 1159 chars (~290 tok) → compacta 533 chars (~134 tok), **-54%**.

## Mosaico de fotogramas para visión
- Combinar N fotogramas en UNA imagen con el filtro `tile` de ffmpeg (sin dependencias nuevas): `-vf "fps=...,scale=W:-1,tile=2x2"`.
- El ahorro no viene de "juntar" (los tokens de visión se cobran por píxeles) sino de que el mosaico permite **bajar la resolución total manteniendo los N momentos**. Medido: 236 KB → 136 KB base64 (-42%), y 4 imágenes → 1 tile de visión.
- **Obligatorio**: explicarle al modelo cómo leer el grid ("celda 1 = más temprano; son el mismo video"), porque sin eso puede interpretarlo como una escena con gente duplicada.
- Ancho de celda configurable (`LENTE_AI_FRAME_WIDTH`, default 384) para los casos que necesitan detalle postural.

## Memoria de aprendizajes sin vector store
- La dimensión en la que un aprendizaje aplica es **deporte + tipo de falla**: alcanza con un índice compuesto en Postgres. Un vector DB agrega infraestructura y fallas para resolver algo que un `WHERE` resuelve.
- Tres orígenes con alcance distinto: `curado` (global, escrito desde el conocimiento del dominio), `usuario` (solo del dueño), `negativo` (restricción "no repitas X").
- **Nunca** cruzar datos de video entre cuentas: un video ajeno ancla el modelo a otro cuerpo y otro contexto. Verificar con un segundo usuario que reciba 0.
- El orden de recuperación prioriza aprendizajes universales cuando todavía no se conoce el tipo de falla (se recupera antes de clasificar), y el prompt aclara *"aplicá SOLO los que correspondan; si uno no aplica, ignoralo"*.
- Contador `uses` como telemetría para detectar aprendizaje que se inyecta y nunca aplica.

## Razonamiento en dos pasadas secuenciales
- Pasada 1 (barata, estructurada): auditar → clasificar el error → elegir UNA corrección → devolver JSON con `discarded` (qué se evaluó y por qué se descartó). Persistir el veredicto.
- Pasada 2 (con visión): el informe **desarrolla** el veredicto en vez de re-razonarlo, y el prompt le prohíbe contradecirlo o repetir las alternativas descartadas.
- La restricción de "UNA sola corrección" es lo que elimina la lista genérica de 5 mejoras que no prioriza nada.
- La traza de auditoría vive en el campo `discarded` del JSON, no en un bloque `<razonamiento>`: nuestro parser (`extractJson`) devuelve `null` si hay texto antes del JSON y el job falla.

## Framing honesto en métricas débiles
- Cuando el dato no sostiene una conclusión, decirlo: "video de 9s → sirve para técnica, no para resistencia"; "balón no visible → posesión es especulación".
- Un análisis que dice "no pude medir X" es más útil que uno que inventa la métrica.


