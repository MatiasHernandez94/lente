-- Las subidas/lecturas usan URLs firmadas emitidas por el servidor con service
-- role. Estas policies permitían que anon/authenticated leyeran, sobrescribieran
-- y borraran cualquier objeto del bucket sin autorización por video.
-- Rollback de emergencia: restaurar las cuatro policies de 0014. Esto vuelve a
-- exponer TODOS los videos, por lo que solo debe usarse bajo respuesta a incidentes.
drop policy if exists videos_insert on storage.objects;
drop policy if exists videos_select on storage.objects;
drop policy if exists videos_update on storage.objects;
drop policy if exists videos_delete on storage.objects;
