import { createHmac, timingSafeEqual } from "node:crypto";

const RECEIPT_TTL_MS = 4 * 60 * 60 * 1000;

function signature(userId: string, ref: string, expires: number, secret: string): Buffer {
  return createHmac("sha256", secret).update(JSON.stringify(["lente-upload-v1", userId, ref, expires])).digest();
}

export function createUploadReceipt(userId: string, ref: string, secret: string, now = Date.now()): string {
  if (!secret) throw new Error("Falta la clave para validar subidas.");
  const expires = now + RECEIPT_TTL_MS;
  return `${expires}.${signature(userId, ref, expires, secret).toString("hex")}`;
}

export function verifyUploadReceipt(receipt: string, userId: string, ref: string, secret: string, now = Date.now()): boolean {
  if (!secret || !/^\d{13}\.[0-9a-f]{64}$/.test(receipt)) return false;
  const [expiry, digest] = receipt.split(".");
  const expires = Number(expiry);
  if (expires < now || expires > now + RECEIPT_TTL_MS) return false;
  return timingSafeEqual(Buffer.from(digest, "hex"), signature(userId, ref, expires, secret));
}
