-- Amplía la cola de procesamiento con el informe táctico del asistente técnico (coach).
alter table public.processing_jobs
  drop constraint if exists processing_jobs_kind_check;

alter table public.processing_jobs
  add constraint processing_jobs_kind_check
  check (kind in ('detect-sport', 'improvements', 'sports', 'coach-report'));