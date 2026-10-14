# Preferencias del usuario (recurrentes, verificar antes de asumir lo contrario)

## Producto y análisis
- **Fricción mínima en el flujo de video**: un solo click debe llevar de "subir video" a "ver resultados". Nunca pedir datos que se pueden derivar (título desde el nombre del archivo) ni exigir un segundo click para iniciar el análisis.
- **El contexto se pide antes, no después**: el deporte se selecciona **primero** y es el que define qué métricas tienen sentido. El usuario fue explícito: *"hay que poner en contexto el deporte primero y en base a eso colocar los parámetros"*.
- **Análisis con datos reales, no plantillas**: si el pipeline no puede medir algo, se dice. El usuario rechaza métricas genéricas que se repiten igual en todos los videos.
- **Nada de payload basura**: los `frames[]` multi-MB no deben viajar en respuestas que no los usan.
- **Franqueza sobre la precisión**: si una distancia o altura es aproximada (escala derivada de la altura del sujeto), se muestra como aproximada. No presentar 24.9 cm como exacto.

## Sobre el agente IA
- **Pregunta por la arquitectura antes de construir**: el usuario consultó si correspondía otro agente, otra IA, o si "se satura la información". Valora que se le explique el porqué de una decisión de arquitectura, no solo que se implemente.
- **Rechaza la redundancia sin criterio**: dos agentes en paralelo sobre el mismo video las rechazó por contradicción ("es peor que una opinión clara, no es más información"). Prefiere el cruce de fuentes con roles distintos.
- **Aislamiento de datos entre cuentas es requisito**, no opcional.

## Comunicación
- **Idioma**: responde en español rioplatense, tono directo y de entrenador. El usuario escribe en ese registro.
- **Sin relleno**: ir al grano. Cuando hay trade-off, nombrarlo y decir qué se eligió y qué quedó pendiente.
- **Admite cuando algo quedó sin hacer**: el usuario valoró que se listara explícitamente lo pendiente (ej. la `FEW_SHOT_MEMORIA_DINAMICA`).
- **Verificación visible**: build + lint + tests al cierre de cada cambio. Los 10 errores de lint preexistentes en `src/lib/execution/geom.test.ts` son ajenos y se pueden mencionar como tales.
