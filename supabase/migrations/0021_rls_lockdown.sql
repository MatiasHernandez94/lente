-- 0021: cerrar el acceso anónimo a la base.
--
-- Auditoría: 15 de 18 tablas de `public` no tenían RLS y el anon key es público
-- (NEXT_PUBLIC_SUPABASE_ANON_KEY), por lo que cualquiera podía leer y escribir
-- toda la base vía PostgREST (incluido users.password_hash).
--
-- La app accede a las tablas exclusivamente con service role desde el servidor
-- (src/lib/db.ts + "server-only"), que saltea RLS. El cliente del navegador solo
-- usa Storage con URL firmada (src/lib/videos/client.ts) y Auth, que no dependen
-- de permisos sobre las tablas de `public`.

-- 1) RLS deny-by-default en todas las tablas de public (sin policies = nadie
--    salvo service role puede leer/escribir).
do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- 2) Defensa en profundidad: quitar los grants de tabla/secuencia a los roles
--    expuestos por PostgREST. El service role no depende de estos grants.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- 3) Que las tablas futuras tampoco nazcan expuestas (best effort: requiere ser
--    dueño de los default privileges; si no, la migración sigue).
do $$
begin
  alter default privileges in schema public revoke all on tables from anon, authenticated;
  alter default privileges in schema public revoke all on sequences from anon, authenticated;
exception
  when others then
    raise notice 'No se pudieron revocar default privileges: %', sqlerrm;
end $$;

-- 4) Columna legada del login propio (hoy Supabase Auth). Ya no se usa.
alter table public.users drop column if exists password_hash;
