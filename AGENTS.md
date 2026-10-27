<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Reglas del proyecto (usuario)

- **QA obligatorio en cada desarrollo**: después de cualquier cambio de código, realizar pruebas de QA:
  - Registrar el comportamiento esperado y verificar el flujo real (subir, registrarse, procesar, borrar, etc.).
  - Probar los bordes: campos vacíos, datos inválidos, dobles envíos, permisos.
  - Verificar integración real con la base de datos cuando corresponda.
- **Reportar mejoras**: al finalizar, listar qué se podría mejorar (UX, performance, accesibilidad, seguridad) aunque no se implemente en ese momento.
- No romper la regla de pruebas: `npx tsc --noEmit`, `npm test`, `npx eslint` sobre los archivos tocados, y build si toca páginas/rutas.
