import "server-only";
import { getClient } from "./db";

const VIDEOS_BUCKET = "videos";

function pathFor(videoId: string, extension: string): string {
  return `uploads/${videoId}${extension}`;
}

export async function createVideoUploadUrl(videoId: string, extension: string): Promise<{ path: string; url: string }> {
  const path = pathFor(videoId, extension);
  const { data, error } = await getClient().storage.from(VIDEOS_BUCKET).createSignedUploadUrl(path);
  if (error) throw new Error(`No se pudo preparar la subida: ${error.message}`);
  return { path, url: data.signedUrl };
}

export async function getSignedVideoUrl(path: string, expiresIn = 7200): Promise<string | null> {
  const { data, error } = await getClient().storage.from(VIDEOS_BUCKET).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data.signedUrl;
}

export async function deleteVideo(path: string): Promise<void> {
  await getClient().storage.from(VIDEOS_BUCKET).remove([path]);
}
