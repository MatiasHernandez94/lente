-- Las huellas de videos anteriores quedan en NULL: no se deducen del nombre.
-- Rollback: DROP INDEX public.videos_owner_fingerprint_idx; ALTER TABLE public.videos DROP COLUMN fingerprint_v1;
alter table public.videos add column if not exists fingerprint_v1 text;

-- El runner usa transacciones y no admite CREATE INDEX CONCURRENTLY.
create index if not exists videos_owner_fingerprint_idx
  on public.videos (user_id, fingerprint_v1) where fingerprint_v1 is not null;
