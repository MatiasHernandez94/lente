-- Migración 0009: perfil de usuario (datos básicos, deportes y roles alumno/profesor).
-- Fase 1: modelo de datos para registro extendido y vínculo N:M alumno <-> profesor.

-- 1) Perfil: columnas nuevas en public.users
alter table public.users
  add column peso_kg      numeric,
  add column altura_cm    numeric,
  add column rol          text not null default 'alumno',
  add column deporte_docente text,
  add column tutor_email  text,
  add column terms_accepted     boolean not null default false,
  add column terms_accepted_at  text;

alter table public.users
  add constraint users_rol_check check (rol in ('alumno', 'profesor'));

-- 2) Catálogo de deportes. `destacado` marca los que se muestran por defecto en la UI.
create table public.deportes (
  id        text primary key,
  nombre    text not null,
  destacado boolean not null default false
);

insert into public.deportes (id, nombre, destacado) values
  ('futbol',        'Fútbol',        true),
  ('tenis',         'Tenis',         true),
  ('padel',         'Pádel',         true),
  ('baloncesto',    'Baloncesto',    true),
  ('voleibol',      'Voleibol',      true),
  ('running',       'Running',       true),
  ('natacion',      'Natación',      true),
  ('ciclismo',      'Ciclismo',      true),
  ('fitness',       'Fitness / Gimnasio', true),
  ('golf',          'Golf',          false),
  ('rugby',         'Rugby',         false),
  ('boxeo',         'Boxeo',         false),
  ('artes-marciales','Artes marciales', false),
  ('surf',          'Surf',          false),
  ('escalada',      'Escalada',      false),
  ('snowboard',     'Snowboard',     false),
  ('skate',         'Skate',         false),
  ('otro',          'Otro deporte',  false);

-- 3) Deportes que practica cada usuario (N:M)
create table public.user_deportes (
  user_id    text not null references public.users(id) on delete cascade,
  deporte_id text not null references public.deportes(id) on delete cascade,
  primary key (user_id, deporte_id)
);

-- 4) Vínculo alumno <-> profesor (N:M, sin duplicados gracias a la PK compuesta)
create table public.profesor_alumno (
  profesor_id text not null references public.users(id) on delete cascade,
  alumno_id   text not null references public.users(id) on delete cascade,
  created_at  text not null,
  primary key (profesor_id, alumno_id)
);

create index idx_profesor_alumno_alumno on public.profesor_alumno(alumno_id);