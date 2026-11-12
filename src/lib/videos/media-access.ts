interface MediaUser {
  id: string;
  rol: string;
}

/** Una misma referencia puede estar asociada a más de un video. */
export async function canReadMedia(
  user: MediaUser,
  ownerIds: readonly string[],
  isAlumnoOf: (profesorId: string, alumnoId: string) => Promise<boolean>,
): Promise<boolean> {
  if (ownerIds.includes(user.id)) return true;
  if (user.rol !== "profesor") return false;
  for (const ownerId of new Set(ownerIds)) {
    if (await isAlumnoOf(user.id, ownerId)) return true;
  }
  return false;
}
