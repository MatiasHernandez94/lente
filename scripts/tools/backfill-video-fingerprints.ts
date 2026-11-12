/** Calcula huellas de videos existentes, sin modificar archivos ni sobrescribir huellas. */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { fingerprintVideo } from "../../src/lib/videos/fingerprint";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z_][A-Z_0-9]*)=(.*)$/);
  if (match && process.env[match[1]] === undefined) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Falta configuración de Supabase.");
  const db = createClient(url, key, { auth: { persistSession: false } });
  let completed = 0;
  let missing = 0;
  let failed = 0;
  let offset = 0;

  // El script informa cuántos quedan; se puede volver a ejecutar sin tocar
  // los que ya tienen huella. El límite de filas también lo impone Supabase.
  const { data: rows, error } = await db.from("videos")
    .select("id, source_ref")
    .eq("source_type", "upload")
    .is("fingerprint_v1", null)
    .order("id")
    .range(0, 9999);
  if (error) throw new Error(`No se pudieron listar los videos: ${error.message}`);

  for (const row of rows ?? []) {
    offset++;
    if (!row.source_ref) { missing++; continue; }
    const { data: file, error: downloadError } = await db.storage.from("videos").download(`video/${row.source_ref}`);
    if (downloadError || !file) {
      if (downloadError?.statusCode === "404") missing++;
      else { failed++; console.error(`No se pudo descargar video ${row.id}: ${downloadError?.message ?? "sin archivo"}`); }
      continue;
    }
    try {
      const fingerprint = await fingerprintVideo(file);
      const { error: updateError } = await db.from("videos").update({ fingerprint_v1: fingerprint })
        .eq("id", row.id).is("fingerprint_v1", null);
      if (updateError) throw updateError;
      completed++;
    } catch (error) {
      failed++;
      console.error(`No se pudo completar video ${row.id}:`, error instanceof Error ? error.message : String(error));
    }
    console.log(`Revisados ${offset}/${rows?.length ?? 0}; calculados ${completed}; faltantes ${missing}; errores ${failed}`);
  }
  console.log(JSON.stringify({ total: rows?.length ?? 0, completed, missing, failed }));
  if (failed) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
