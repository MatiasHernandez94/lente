-- Reintento automático con backoff: los jobs que fallan temporalmente vuelven a
-- pending luego de run_after (retraso exponencial según intentos), en vez de ir
-- directo a error. El worker usa esto para auto-retry de análisis con fallos
-- transitorios (quota de IA, red, recursos) antes de marcarlos como error final.
alter table public.processing_jobs
  add column if not exists run_after timestamptz;