# Huella de video: evidencia

- Flujo: identificar archivos idénticos de una misma cuenta antes de subirlos y ofrecer ver el existente o crear uno nuevo.
- RED: `node --experimental-strip-types --test src/lib/videos/fingerprint.test.ts` falló porque el módulo de huella aún no existía.
- GREEN: el mismo comando pasó 3 pruebas: contenido idéntico con nombres distintos, contenido diferente incluyendo el último bloque, y archivo vacío.
- Cobertura del módulo de huella: 100% de líneas y ramas, con `node --experimental-strip-types --experimental-test-coverage --test src/lib/videos/fingerprint.test.ts`.
- PostgreSQL real: se aplicó la migración en una tabla temporal, dentro de una transacción revertida, y se comprobó la consulta por cuenta y huella. Esto no prueba el endpoint ni RLS.
- Suite completa: 125 pruebas OK; TypeScript, ESLint de archivos tocados y build OK.
- Pendiente: QA de interfaz y endpoint autenticado con la migración aplicada a un entorno de pruebas; videos antiguos no tienen huella y requieren un backfill separado. El cliente calcula y declara la huella: no es una verificación independiente del archivo por el servidor.
