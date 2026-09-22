-- Migración: tabla de reset de contraseña
create table public.password_resets (
  id         text primary key,
  user_id    text not null references public.users(id) on delete cascade,
  token      text not null unique,
  expires_at text not null,
  used       boolean not null default false,
  created_at text not null
);

create index idx_password_resets_token on public.password_resets(token);
create index idx_password_resets_user on public.password_resets(user_id);
