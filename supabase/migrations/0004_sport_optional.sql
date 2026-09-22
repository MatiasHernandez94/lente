-- Migración: hacer sport opcional con default 'general'
ALTER TABLE public.videos ALTER COLUMN sport SET DEFAULT 'general';
ALTER TABLE public.videos ALTER COLUMN sport DROP NOT NULL;
