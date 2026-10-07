/**
 * Error de dominio para respuestas HTTP con status code.
 *
 * Vive en un módulo libre de `server-only` para que los tests de `node:test`
 * puedan importarlo: `videoService.ts` no es importable fuera de Next.js porque
 * declara `import "server-only"`.
 */
export class ApiServiceError extends Error {
  readonly statusCode: number;
  /**
   * Clasificación del fallo. El pipeline de reintentos de `processing_jobs`
   * la lee desde `errorPayload()` para decidir si un job se reencola.
   */
  readonly kind?: string;

  constructor(statusCode: number, message: string, kind?: string) {
    super(message);
    this.statusCode = statusCode;
    this.kind = kind;
  }
}
