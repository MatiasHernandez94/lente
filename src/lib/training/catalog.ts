export const CATEGORIES = [
  { id: "inferior", label: "Tren inferior" },
  { id: "superior", label: "Tren superior" },
  { id: "core", label: "Core y estabilidad" },
  { id: "potencia", label: "Potencia y salto" },
  { id: "agilidad", label: "Agilidad" },
  { id: "movilidad", label: "Movilidad" },
] as const;

export type TrainingCategory = (typeof CATEGORIES)[number]["id"];

export interface Exercise {
  id: string;
  name: string;
  category: TrainingCategory;
  goal: string;
  equipment: string;
  dosage: string;
  steps: readonly string[];
  cues: readonly string[];
  caution: string;
}

/** Contenido inicial orientativo, pendiente de revisión profesional. */
export const EXERCISES: readonly Exercise[] = [
  {
    id: "sentadilla-goblet", name: "Sentadilla con mancuerna", category: "inferior",
    goal: "Desarrollar fuerza de piernas y control de la postura.", equipment: "Mancuerna o pesa rusa",
    dosage: "Orientativo: 2–3 series de 6–10 repeticiones, con una carga que permita controlar el movimiento.",
    steps: ["Sostené la pesa cerca del pecho y apoyá los pies separados aproximadamente al ancho de hombros.", "Bajá de forma controlada hasta una profundidad cómoda y volvé a subir empujando el suelo."],
    cues: ["Mantené el apoyo completo del pie.", "Dejá que las rodillas acompañen la dirección de los pies."],
    caution: "Si no podés mantener el control, reducí la carga o practicá sin peso.",
  },
  {
    id: "remo-mancuerna", name: "Remo con mancuerna", category: "superior",
    goal: "Trabajar la tracción de la espalda y el control del torso.", equipment: "Mancuerna y banco",
    dosage: "Orientativo: 2–3 series de 8–12 repeticiones por lado, con una carga controlable.",
    steps: ["Apoyá una mano y una rodilla en el banco, con el torso estable.", "Llevá la mancuerna hacia el costado del torso y bajala lentamente."],
    cues: ["Evitá girar el torso para levantar el peso.", "Mantené el cuello cómodo y la espalda estable."],
    caution: "Empezá liviano y evitá tirones bruscos.",
  },
  {
    id: "pallof", name: "Press Pallof", category: "core",
    goal: "Practicar estabilidad del tronco frente a la rotación.", equipment: "Polea o banda y punto de anclaje",
    dosage: "Orientativo: 2–3 series de 8–12 repeticiones por lado, sin perder la postura.",
    steps: ["Ubicate de costado al anclaje y sostené el agarre frente al pecho.", "Extendé los brazos al frente sin girar el tronco y volvé lentamente."],
    cues: ["Mantené las rodillas relajadas y respiración continua.", "Ajustá la resistencia si el torso gira."],
    caution: "Controlá el regreso para que la banda o polea no te arrastre.",
  },
  {
    id: "salto-cajon", name: "Salto al cajón bajo", category: "potencia",
    goal: "Practicar un salto explosivo y un aterrizaje controlado.", equipment: "Cajón estable y bajo",
    dosage: "Orientativo: 2–3 series de 3–5 saltos, con descanso suficiente para mantener la calidad.",
    steps: ["Frente a un cajón bajo y estable, flexioná caderas y rodillas para preparar el salto.", "Saltá y aterrizá suavemente con ambos pies; bajá caminando, sin saltar hacia atrás."],
    cues: ["Elegí una altura que no te obligue a perder la postura.", "Interrumpí la serie si el aterrizaje deja de ser controlado."],
    caution: "Requiere experiencia previa y espacio despejado; consultá a un profesional si no conocés la técnica.",
  },
  {
    id: "desplazamiento-banda", name: "Pasos laterales con banda", category: "agilidad",
    goal: "Trabajar control lateral de cadera y piernas.", equipment: "Banda elástica circular",
    dosage: "Orientativo: 2–3 series de 8–12 pasos por lado, manteniendo el control.",
    steps: ["Colocá la banda por encima de las rodillas y adoptá una semiflexión cómoda.", "Dá pasos laterales controlados sin juntar completamente los pies; repetí hacia el otro lado."],
    cues: ["Mantené el torso estable y los pies apuntando hacia adelante.", "No permitas que la banda lleve las rodillas hacia adentro."],
    caution: "Elegí una resistencia que permita mantener la postura.",
  },
  {
    id: "movilidad-tobillo", name: "Movilidad de tobillo en pared", category: "movilidad",
    goal: "Explorar el movimiento del tobillo de forma controlada.", equipment: "Pared",
    dosage: "Orientativo: 1–2 series de 8–10 movimientos suaves por lado.",
    steps: ["Apoyá el pie frente a una pared y mantené el talón en el suelo.", "Llevá la rodilla hacia la pared dentro de un rango cómodo y regresá."],
    cues: ["Mantené el talón apoyado y el movimiento lento.", "Ajustá la distancia a la pared sin forzar el rango."],
    caution: "No fuerces la articulación; detenete si aparece dolor.",
  },
];

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function filterExercises(filters: { category?: string; query?: string }): Exercise[] {
  const query = normalize(filters.query ?? "");
  return EXERCISES.filter((exercise) => {
    const matchesCategory = !filters.category || exercise.category === filters.category;
    const text = normalize(`${exercise.name} ${exercise.goal} ${exercise.equipment}`);
    return matchesCategory && (!query || text.includes(query));
  });
}

export function getExercise(id: string): Exercise | undefined {
  return EXERCISES.find((exercise) => exercise.id === id);
}
