-- Migración 0008: pendientes extraídos por IA desde texto libre.
create table public.pendientes (
  id          text primary key,
  user_id     text not null references public.users(id) on delete cascade,
  source_text text not null,
  content     text not null,
  created_at  text not null
);

create index idx_pendientes_user_created on public.pendientes(user_id, created_at desc);