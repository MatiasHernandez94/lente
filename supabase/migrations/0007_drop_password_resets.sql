-- Limpieza: la tabla password_resets era parte del flujo local de reset de
-- contraseña, reemplazado por Supabase Auth (resetPasswordForEmail).
drop table if exists public.password_resets;