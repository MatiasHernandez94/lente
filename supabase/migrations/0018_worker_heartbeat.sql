-- Heartbeat del worker externo: una sola fila que el worker refresca mientras
-- corre. /api/cron/health la consulta para avisar por Telegram si el proceso
-- se cayó; sin esto, un worker muerto es indistinguible de "no hay trabajo
-- en la cola", que es justamente el estado en el que se pierden los errores.
create table if not exists public.worker_heartbeat (
  id smallint primary key default 1 check (id = 1),
  worker_id text not null,
  pid int,
  version text,
  jobs_claimed bigint not null default 0,
  last_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Solo el service role (saltea RLS) la escribe y la lee; anon y authenticated no.
alter table public.worker_heartbeat enable row level security;
