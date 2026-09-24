import "server-only";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getClient } from "@/lib/db";

export const VIDEOS_BUCKET = "videos";
export const ANALYSES_BUCKET = "analyses";
const VIDEOS_OBJECT_PREFIX = "video";

export interface ResolvedVideoSource {
  /** Ruta local al video, o null si no se puede resolver. */
  filePath: string | null;
  /** URL pública o firmada para stream (cuando no hay archivo local). */
  streamUrl: string | null;
}

function storageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function videoObjectPath(ref: string): string {
  return `${VIDEOS_OBJECT_PREFIX}/${ref}`;
}

/** Asegura que el bucket privado `videos` exista. */
export async function ensureVideosBucket(): Promise<void> {
  if (!storageConfigured()) return;
  try {
    const existing = await getClient().storage.getBucket(VIDEOS_BUCKET);
    if (existing.error) {
      await getClient().storage.createBucket(VIDEOS_BUCKET, { public: false });
    }
  } catch {
    // Best effort: no romper el flujo si Storage no está disponible.
  }
}

/**
 * Sube el video al bucket privado `videos`. Devuelve true si quedó en Storage,
 * false si Storage no estaba disponible (sube solo a filesystem local).
 */
export async function uploadVideoToStorage(buffer: Buffer, ref: string, contentType: string): Promise<boolean> {
  if (!storageConfigured()) return false;
  try {
    await ensureVideosBucket();
    const { error } = await getClient().storage.from(VIDEOS_BUCKET).upload(videoObjectPath(ref), buffer, {
      contentType,
      upsert: true,
    });
    return !error;
  } catch {
    return false;
  }
}

/** Descarga el video desde Storage y lo deja en un archivo temporal. */
export async function downloadVideoFromStorage(ref: string): Promise<Buffer | null> {
  if (!storageConfigured()) return null;
  try {
    const { data, error } = await getClient().storage.from(VIDEOS_BUCKET).download(videoObjectPath(ref));
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

/** URL firmada temporal para reproducir el video sin exponer Storage. */
export async function getVideoStreamUrl(ref: string, expiresInSeconds = 3600): Promise<string | null> {
  if (!storageConfigured()) return null;
  try {
    const { data, error } = await getClient().storage.from(VIDEOS_BUCKET).createSignedUrl(videoObjectPath(ref), expiresInSeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/** Crea una URL firmada para que el navegador suba el video directo a Storage (sin pasar por nuestra API, que tiene límite de body). */
export async function createVideoSignedUploadUrl(
  ref: string,
): Promise<{ signedUrl: string; token: string } | null> {
  if (!storageConfigured()) return null;
  try {
    await ensureVideosBucket();
    const { data, error } = await getClient().storage.from(VIDEOS_BUCKET).createSignedUploadUrl(videoObjectPath(ref), {
      upsert: true,
    });
    if (error || !data?.signedUrl) return null;
    return { signedUrl: data.signedUrl, token: data.token };
  } catch {
    return null;
  }
}

/** Descarga el video de Storage y lo escribe en data/uploads (best effort; útil en dev para el análisis completo). */
export async function mirrorVideoToLocal(
  ref: string,
  localDir: string = join(process.cwd(), "data", "uploads"),
): Promise<boolean> {
  try {
    const buffer = await downloadVideoFromStorage(ref);
    if (!buffer) return false;
    mkdirSync(localDir, { recursive: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(localDir, ref), buffer);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resuelve la fuente de un video:
 *  1. Si el archivo está en data/uploads (local), usa esa ruta.
 *  2. Si no, intenta descargarlo desde Storage a un archivo temporal.
 * Devuelve filePath (para ffmpeg) o streamUrl (para el player).
 */
export async function resolveVideoSource(
  sourceRef: string,
  opts: { localDir: string; useTemp?: boolean } = { localDir: join(process.cwd(), "data", "uploads") },
): Promise<ResolvedVideoSource> {
  const localPath = join(opts.localDir, sourceRef);
  if (existsSync(localPath)) {
    return { filePath: localPath, streamUrl: null };
  }

  // Sin Storage: no hay forma de obtener el video.
  const buffer = await downloadVideoFromStorage(sourceRef);
  if (!buffer) {
    return { filePath: null, streamUrl: null };
  }

  if (!opts.useTemp) {
    const url = await getVideoStreamUrl(sourceRef);
    return { filePath: null, streamUrl: url };
  }

  // Escribimos a tmp para que ffmpeg/python pueda procesarlo.
  const tmpFile = join(tmpdir(), `lente-${randomUUID()}-${sourceRef}`);
  mkdirSync(tmpdir(), { recursive: true });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(tmpFile, buffer);
  return { filePath: tmpFile, streamUrl: null };
}

/** Versión síncrona de resolución local (si existe, sin tocar Storage). */
export function hasLocalVideo(sourceRef: string, localDir: string = join(process.cwd(), "data", "uploads")): boolean {
  return existsSync(join(localDir, sourceRef));
}

// ── Persistencia de análisis (JSON) en Storage ──────────────────────────────

async function ensureAnalysesBucket(): Promise<void> {
  if (!storageConfigured()) return;
  try {
    const existing = await getClient().storage.getBucket(ANALYSES_BUCKET);
    if (existing.error) {
      await getClient().storage.createBucket(ANALYSES_BUCKET, { public: false });
    }
  } catch {
    // Best effort
  }
}

/** Guarda un JSON de análisis en el bucket privado `analyses`. */
export async function saveAnalysisToStorage<T>(key: string, data: T): Promise<boolean> {
  if (!storageConfigured()) return false;
  try {
    await ensureAnalysesBucket();
    const { error } = await getClient().storage.from(ANALYSES_BUCKET).upload(key, JSON.stringify(data), {
      contentType: "application/json",
      upsert: true,
    });
    return !error;
  } catch {
    return false;
  }
}

/** Lee un JSON de análisis desde el bucket privado `analyses`. */
export async function readAnalysisFromStorage<T>(key: string): Promise<T | null> {
  if (!storageConfigured()) return null;
  try {
    const { data, error } = await getClient().storage.from(ANALYSES_BUCKET).download(key);
    if (error || !data) return null;
    const text = await data.text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}