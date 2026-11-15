# Biblioteca inicial de entrenamientos

- Alcance: seis fichas iniciales de preparación física para básquet; el contenido es orientativo y requiere revisión profesional. No hay videos ni análisis de ejecución.
- RED: `node --experimental-strip-types --test src/lib/training/catalog.test.ts` falló porque el catálogo todavía no existía.
- GREEN: 4/4 tests del catálogo: ids, categorías, búsqueda sin acentos, filtros combinados e id inexistente.
- Cobertura del catálogo: 100% líneas y ramas con `node --experimental-strip-types --experimental-test-coverage --test src/lib/training/catalog.test.ts`.
- QA local autenticado: navegación a biblioteca y ficha, filtro de movilidad, búsqueda sin resultados y 404 para id inválido. Sin sesión `/app/entrenamientos` redirige al ingreso.
- Suite: 124 tests OK, TypeScript, ESLint de archivos tocados y build OK. El build informa cinco advertencias preexistentes sobre trazado de archivos.
- Pendiente: validación profesional del contenido, QA en móvil, biblioteca completa de 80 ejercicios, demostraciones en video y análisis de ejecución.
