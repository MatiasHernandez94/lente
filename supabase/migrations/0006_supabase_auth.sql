-- Alinea public.users con Supabase Auth.
-- Las contraseñas viven en auth.users; public.users queda como perfil de la app.

alter table public.users
  alter column password_hash drop not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, name, email, created_at)
  values (
    new.id::text,
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(coalesce(new.email, 'usuario'), '@', 1)),
    coalesce(new.email, ''),
    coalesce(new.created_at::text, now()::text)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
