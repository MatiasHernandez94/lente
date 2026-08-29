import "server-only";

interface Bucket {
  limit: number;
  windowMs: number;
  timestamps: number[];
}

const store = new Map<string, Bucket>();

function now(): number {
  return Date.now();
}

export function assertNotRateLimited(key: string, limit: number, windowMs: number): void {
  const bucket = store.get(key);
  if (!bucket) {
    store.set(key, { limit, windowMs, timestamps: [now()] });
    return;
  }

  const cutoff = now() - bucket.windowMs;
  const recent = bucket.timestamps.filter((t) => t > cutoff);
  if (recent.length >= bucket.limit) {
    store.set(key, { ...bucket, timestamps: recent });
    throw new Error("Demasiados intentos. Espere unos minutos y vuelva a intentar.");
  }

  recent.push(now());
  store.set(key, { ...bucket, timestamps: recent });
}