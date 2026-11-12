const CHUNK_SIZE = 4 * 1024 * 1024;

/** SHA-256 de las huellas SHA-256 de cada bloque de 4 MiB (versión 1). */
export async function fingerprintVideo(file: Blob): Promise<string> {
  if (file.size === 0) throw new Error("El archivo de video está vacío.");
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
    const buffer = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
    chunks.push(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)));
  }
  const combined = new Uint8Array(chunks.length * 32);
  chunks.forEach((chunk, index) => combined.set(chunk, index * 32));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", combined));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
