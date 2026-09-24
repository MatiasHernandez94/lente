-- Migración: permitir asignar un video/análisis a un alumno vinculado.
-- El profesor de un video puede asociar el análisis a una alumna/o de su lista.
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS alumno_id text references public.users(id) on delete set null;

create index if not exists idx_videos_alumno on public.videos(alumno_id);