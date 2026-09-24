-- Migración 0010: correcciones del profesor sobre videos de sus alumnos.
-- Fase 2: el profesor registra observaciones puntuales (opcionalmente con
-- minuto de inicio/fin del video) y comparte el enlace por WhatsApp o correo.

create table public.correcciones (
  id             text primary key,
  video_id       text not null references public.videos(id) on delete cascade,
  profesor_id    text not null references public.users(id) on delete cascade,
  alumno_id      text not null references public.users(id) on delete cascade,
  mensaje        text not null,
  minuto_inicio  integer,
  minuto_fin     integer,
  created_at     text not null
);

create index idx_correcciones_video on public.correcciones(video_id, created_at desc);
create index idx_correcciones_alumno on public.correcciones(alumno_id, created_at desc);
create index idx_correcciones_profesor on public.correcciones(profesor_id, created_at desc);