/** Imágenes estáticas revisadas; no son demostraciones de movimiento. */
export const TRAINING_IMAGES: Readonly<Record<string, string>> = {
  "sentadilla-goblet": "/training-references/sentadilla-goblet.webp",
  "remo-mancuerna": "/training-references/remo-mancuerna.webp",
  "pallof": "/training-references/pallof.webp",
  "dead-bug": "/training-references/dead-bug.webp",
  "salto-cajon": "/training-references/salto-cajon.webp",
  "lanzamiento-balon-pecho": "/training-references/lanzamiento-balon-pecho.webp",
  "desplazamiento-conos": "/training-references/desplazamiento-conos.webp",
  "rotacion-toracica": "/training-references/rotacion-toracica.webp",
};

export function getTrainingImage(id: string): string | undefined {
  return Object.hasOwn(TRAINING_IMAGES, id) ? TRAINING_IMAGES[id] : undefined;
}
