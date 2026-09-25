-- Cola de procesamiento pesado (descarga yt-dlp, ffmpeg, análisis Python/YOLO).
-- En producción (Vercel) los endpoints encolan jobs; un worker externo
-- (script standalone) los reclama, procesa con los módulos de src/lib y
-- escribe los resultados a Storage/DB. La tabla solo la toca el service role.

create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  video_id text not null references public.videos(id) on delete cascade,
  kind text not null check (kind in ('detect-sport', 'improvements', 'sports')),
  payload jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'error')),
  error jsonb,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists processing_jobs_queue_idx
  on public.processing_jobs (status, created_at);

create index if not exists processing_jobs_video_idx
  on public.processing_jobs (video_id, kind);

-- Solo el service role (que saltea RLS) accede; anon/authenticated no.
alter table public.processing_jobs enable row level security;