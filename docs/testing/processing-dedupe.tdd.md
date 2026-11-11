# Dedupe de jobs: evidencia

Objetivo: un único job activo por video y tipo; permitir nuevos intentos tras terminar.

- RED: `node --experimental-strip-types --test src/lib/processor-dedupe.test.ts` falló porque todavía no existía el módulo de deduplicación.
- GREEN: el mismo comando pasó 4/4 pruebas: job existente, inserción nueva, conflicto concurrente simulado y errores de base.
- Cobertura del módulo: 100% líneas, 90.91% ramas, con `node --experimental-strip-types --experimental-test-coverage --test src/lib/processor-dedupe.test.ts`.
- PostgreSQL real: en una tabla temporal y transacción revertida se ejecutó la migración y se verificó que rechaza duplicados activos y permite históricos, otros tipos/videos y nuevos intentos. La tabla real no se modificó.
- Pendiente: aplicar la migración al entorno de destino y probar solicitudes concurrentes reales y el flujo de UI con el worker. La verificación de conflictos en TypeScript usa simulación, no concurrencia real.
- La migración falla si ya existen duplicados activos; inspeccionarlos manualmente antes de actuar. El índice bloquea escrituras durante su creación porque el runner usa transacciones.
