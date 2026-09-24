"use client";

import { createClient } from "@/lib/supabase/client";

const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;
const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"];

/**
 * Sube un video directo a Supabase Storage (bucket `videos`) usando una URL
 * firmada, evitando el límite de body de las API routes en producción.
 * Devuelve el ref del archivo (sourceRef del video).
 */
export async function uploadVideoFile(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("El video supera el límite de 250 MB.");
  }
  const ext = file.name.includes(".") ? `.${file.name.split(".").pop()!.toLowerCase()}` : "";
  if (!ALLOWED_VIDEO_EXTENSIONS.includes(ext)) {
    throw new Error("Este formato no es reproducible en navegadores. Use MP4, WebM o MOV.");
  }

  // 1. Pedimos la URL firmada al servidor (valida sesión y formato).
  const signRes = await fetch("/api/upload/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, size: file.size }),
  });
  const signBody = (await signRes.json()) as {
    file?: string;
    path?: string;
    token?: string;
    error?: string;
  };
  if (!signRes.ok || !signBody.file || !signBody.path || !signBody.token) {
    throw new Error(signBody.error ?? "No se pudo iniciar la subida del video.");
  }

  // 2. Subimos el archivo al bucket usando el SDK (misma lógica que el backend).
  const supabase = createClient();
  const { error } = await supabase.storage.from("videos").uploadToSignedUrl(signBody.path, signBody.token, file, {
    contentType: file.type || "application/octet-stream",
    upsert: true,
  });
  if (error) {
    throw new Error(`La subida del video no se completó: ${error.message}`);
  }

  // 3. Best effort: en dev copiamos el video a data/uploads para el análisis completo.
  await fetch("/api/upload/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file: signBody.file }),
  }).catch(() => {});

  return signBody.file;
}