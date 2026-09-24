-- RLS policies para el bucket privado `videos`.
-- Permiten subir (signed upload), leer y actualizar objetos del bucket `videos`.
-- El bucket privado `videos` vive en Supabase Storage y es donde se guardan los videos
-- para que la IA de visión, el player, clips y scout funcionen en producción.

create policy "videos_insert" on storage.objects
  for insert to authenticated, anon
  with check (bucket_id = 'videos');

create policy "videos_select" on storage.objects
  for select to authenticated, anon
  using (bucket_id = 'videos');

create policy "videos_update" on storage.objects
  for update to authenticated, anon
  with check (bucket_id = 'videos');

create policy "videos_delete" on storage.objects
  for delete to authenticated, anon
  using (bucket_id = 'videos');