interface InsertError {
  code?: string;
  message: string;
}

interface CreateJobOptions<T> {
  find: () => Promise<T | null>;
  insert: () => Promise<{ job: T | null; error: InsertError | null }>;
}

/** El índice único de la base decide el ganador, incluso entre procesos distintos. */
export async function createOrReuseActiveJob<T>(
  options: CreateJobOptions<T>,
): Promise<{ job: T; isWinner: boolean }> {
  const existing = await options.find();
  if (existing) return { job: existing, isWinner: false };

  const { job, error } = await options.insert();
  if (!error && job) return { job, isWinner: true };
  if (error?.code === "23505") {
    const winner = await options.find();
    if (winner) return { job: winner, isWinner: false };
  }
  throw new Error(error?.message ?? "No se pudo crear el job de procesamiento");
}
