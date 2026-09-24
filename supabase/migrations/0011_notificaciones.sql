-- Migración 0011: notificaciones entre usuarios (ej. "nuevo alumno vinculado").
-- Fase 2: avisa al profesor cuando una alumna/o lo vincula como tutor.

create table public.notificaciones (
  id         text primary key,
  user_id    text not null references public.users(id) on delete cascade,
  tipo       text not null default 'nuevo_alumno',
  mensaje    text not null,
  ref_id     text,
  leida      boolean not null default false,
  created_at text not null
);

create index idx_notificaciones_user on public.notificaciones(user_id, created_at desc);