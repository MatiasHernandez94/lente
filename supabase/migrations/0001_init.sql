-- Migración inicial: esquema Postgres para LENTE (Supabase)
-- Reemplaza el SQLite local (src/lib/db.ts anterior). Ejecutar en el SQL Editor de Supabase.

create extension if not exists citext;

create table public.users (
  id            text primary key,
  name          text not null,
  email         public.citext not null unique,
  password_hash text not null,
  created_at    text not null
);

create table public.videos (
  id               text primary key,
  user_id          text not null references public.users(id) on delete cascade,
  title            text not null,
  sport            text not null,
  source_type      text not null,
  source_ref       text,
  duration_seconds integer,
  players          text not null default '[]',
  status           text not null default 'pending',
  error_message    text,
  created_at       text not null,
  updated_at       text not null
);

create index idx_videos_user_created on public.videos(user_id, created_at desc);

create table public.analyses (
  video_id     text primary key references public.videos(id) on delete cascade,
  score        integer not null,
  result       text not null,
  generated_at text not null
);

create table public.scout_analyses (
  video_id          text primary key references public.videos(id) on delete cascade,
  status            text not null default 'none',
  fps               integer,
  width             integer,
  height            integer,
  duration_seconds  integer,
  tracks_json       text,
  teams_json        text,
  players_json      text not null default '[]',
  calibration_json  text,
  error_message     text,
  created_at        text not null,
  updated_at        text not null
);

create table public.video_events (
  id         text primary key,
  video_id   text not null references public.videos(id) on delete cascade,
  team       text not null,
  player     text not null default '',
  event_type text not null,
  x          double precision not null,
  y          double precision not null,
  t          double precision not null,
  points     integer,
  created_at text not null
);

create index idx_video_events_video on public.video_events(video_id, t);
