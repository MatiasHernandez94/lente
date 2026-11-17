# Biblioteca inicial de entrenamientos

- Alcance: seis fichas iniciales de preparación física para básquet; el contenido es orientativo y requiere revisión profesional. No hay videos ni análisis de ejecución.
- RED: `node --experimental-strip-types --test src/lib/training/catalog.test.ts` falló porque el catálogo todavía no existía.
- GREEN: 4/4 tests del catálogo: ids, categorías, búsqueda sin acentos, filtros combinados e id inexistente.
- Cobertura del catálogo: 100% líneas y ramas con `node --experimental-strip-types --experimental-test-coverage --test src/lib/training/catalog.test.ts`.
- QA local autenticado: navegación a biblioteca y ficha, filtro de movilidad, búsqueda sin resultados y 404 para id inválido. Sin sesión `/app/entrenamientos` redirige al ingreso.
- Suite: 124 tests OK, TypeScript, ESLint de archivos tocados y build OK. El build informa cinco advertencias preexistentes sobre trazado de archivos.
- Pendiente: validación profesional del contenido, QA en móvil, biblioteca completa de 80 ejercicios, demostraciones en video y análisis de ejecución.

## Segundo lote

- Catálogo ampliado a 12 fichas, dos por categoría. Todas siguen siendo borradores orientativos pendientes de revisión profesional.
- Tests agregados primero: mínimo por categoría, campos esenciales y búsqueda de fichas nuevas por equipamiento; fallaron antes de incorporar el lote y luego pasaron.
- Verificación: 125 tests, TypeScript, ESLint de archivos modificados y build OK; persisten las cinco advertencias de trazado de archivos. No se realizó una nueva prueba visual ni QA móvil.

## Referencias visuales recibidas

- Fuente: `biblioteca_basquet_imagenes_01-80_y_videos_01-06.zip`, entrega del usuario; CRC verificado con `unzip -tq`. El original permanece en Descargas. Incluye 80 PNG, 6 GIF y 6 MP4 derivados de los GIF, todos pendientes de revisión profesional.
- Selección preliminar a partir de una inspección visual de miniaturas: 01, 21, 33, 34, 45, 46, 58 y 70. Se convirtieron a WebP de ancho máximo 720 para las ocho fichas correspondientes y se muestran como imágenes estáticas no validadas, también en la guía.
- Sin asociar: 02 por discrepancia de barra frente a mancuernas; 22 por dudas sobre la posición de la barra; 57 por colocación de banda distinta a la ficha; 69 por dudas de correspondencia con la posición indicada. El resto permanece en el ZIP original, no en la aplicación. Las selecciones no constituyen revisión técnica.
- No se incorporaron GIF ni MP4: requieren revisión del movimiento y presentan limitaciones de calidad, según la entrega. No hay demostraciones en video publicadas.
- RED: test de asociación falló por módulo inexistente; GREEN: `npm test` pasó 129 tests, incluyendo existencia de archivos y exclusión de variantes dudosas. TypeScript, ESLint de archivos tocados y build OK; el build conserva cinco advertencias de trazado preexistentes. No se hizo QA de interfaz ni móvil para esta incorporación.

## Rutina inicial propuesta

- Borrador no personalizado, aún sin revisión profesional: cinco pasos con fases, indicaciones y descansos; el usuario confirma que entiende el carácter preliminar antes de explorar. No se guarda información de salud ni se ajusta automáticamente la siguiente sesión.
- Tests añadidos antes de implementar: fases, existencia de fichas, descansos y prioridad de respuesta ante dolor. RED por módulo inexistente, GREEN en `npm test`: 131 tests. TypeScript, ESLint de archivos de entrenamientos y build OK (cinco advertencias preexistentes).
- QA local autenticado parcial: aviso y bloqueo inicial, inicio, descanso, transición a sentadilla, imagen y detención anticipada. El formulario final y recorrido completo no se verificaron: la sesión local se cerró durante la prueba. No hay QA móvil. Antes de producción: revisión profesional, completar QA autenticado y definir conservación segura de respuestas y reglas de ajuste.
- QA adicional: formulario tras detención, respuesta de esfuerzo fácil con dolor, y orientación de detener y consultar comprobados en navegador local. El recorrido completo y QA móvil siguen pendientes. El usuario solicitó expresamente publicar el borrador; no implica revisión profesional ni personalización.

## Confirmación de revisión del contenido

- El 17/11/2026, el usuario indicó en conversación que es personal trainer y confirmó haber revisado la rutina inicial con sus series y descansos, las 12 fichas existentes y las 8 imágenes incorporadas. Se registra su declaración; no se verificaron credenciales independientemente.
- Alcance limitado al contenido existente en ese momento: no incluye los GIF, los MP4, las demás imágenes del ZIP ni futuros ejercicios o reglas de personalización. La rutina sigue siendo orientativa y no personalizada; las imágenes estáticas no prueban la técnica en movimiento.
