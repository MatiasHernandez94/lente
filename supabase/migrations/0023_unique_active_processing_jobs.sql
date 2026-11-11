-- Si ya hay duplicados activos, la migración falla sin borrar ni cancelar jobs.
-- Resolverlos manualmente después de revisar el estado real de los workers.
-- Rollback: DROP INDEX public.processing_jobs_one_active_per_video_kind_idx;
-- El runner ejecuta las migraciones en transacciones, por eso no admite CONCURRENTLY.
create unique index processing_jobs_one_active_per_video_kind_idx
  on public.processing_jobs (video_id, kind)
  where status in ('pending', 'processing');
