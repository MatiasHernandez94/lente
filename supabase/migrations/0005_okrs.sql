-- Migración: OKRs de ejercicio
create table public.exercise_okrs (
  id          text primary key,
  video_id    text not null references public.videos(id) on delete cascade,
  user_id     text not null references public.users(id) on delete cascade,
  title       text not null,
  objective   text not null,
  key_results jsonb not null default '[]',
  status      text not null default 'active',
  created_at  text not null,
  updated_at  text not null
);

create index idx_exercise_okrs_video on public.exercise_okrs(video_id);
create index idx_exercise_okrs_user on public.exercise_okrs(user_id);

create table public.okr_templates (
  id          text primary key,
  sport       text not null,
  exercise    text,
  title       text not null,
  objective   text not null,
  key_results jsonb not null default '[]',
  difficulty  text not null default 'intermediate'
);

create index idx_okr_templates_sport on public.okr_templates(sport);
