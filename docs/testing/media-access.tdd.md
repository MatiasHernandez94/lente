# QA de acceso a videos

- RED: los tests de `media-access` y `upload-receipt` fallaron antes de crear sus módulos.
- GREEN: 7/7 pruebas unitarias de dueño, profesor vinculado, desconocidos, referencias compartidas, errores y comprobantes alterados o vencidos.
- Cobertura: `node --experimental-strip-types --experimental-test-coverage --test src/lib/videos/media-access.test.ts src/lib/videos/upload-receipt.test.ts` → 100% líneas y 94.74% ramas de ambos módulos.
- QA de integración: `LENTE_QA_MEDIA=1 node scripts/tools/qa-media-access.mjs` contra la app local y Supabase real; 9 verificaciones de sesión, propiedad, profesor, desvinculación y comprobantes. Creó y eliminó exclusivamente cuentas, video y objeto temporales.
- Storage real tras migración 0025: subida y lectura firmadas OK; lectura directa, listado y borrado anónimos bloqueados; objeto temporal eliminado.
- Suite aislada: 120/120 tests, TypeScript, ESLint de archivos modificados y build OK. Los enlaces firmados concedidos antes de revocar acceso siguen válidos hasta su vencimiento.
