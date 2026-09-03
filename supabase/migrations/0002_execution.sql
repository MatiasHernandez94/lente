-- Migración 0002: análisis de ejecución de ejercicios (movilidad/fuerza).
-- Ejecutar en el SQL Editor de Supabase, igual que 0001_init.sql.
-- Tabla 1:1 con videos, siguiendo el patrón de scout_analyses.

create table public.execution_analyses (
  video_id          text primary key references public.videos(id) on delete cascade,
  status            text not null default 'none',
  fps               integer,
  width             integer,
  height            integer,
  duration_seconds  integer,
  exercise_id       text,
  result_json       text,
  error_message     text,
  created_at        text not null,
  updated_at        text not null
);
