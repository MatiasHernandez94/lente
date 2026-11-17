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

/** Contenido inicial orientativo revisado por un personal trainer. */
export const EXERCISES: readonly Exercise[] = [
  {
    id: "peso-muerto-mancuernas", name: "Peso muerto rumano con mancuernas", category: "inferior",
    goal: "Trabajar la fuerza de cadera y la parte posterior de las piernas.", equipment: "Dos mancuernas",
    dosage: "Orientativo: 2–3 series de 6–10 repeticiones con carga liviana y controlada.",
    steps: ["De pie, sostené las mancuernas delante de los muslos con las rodillas ligeramente flexionadas.", "Llevá las caderas hacia atrás y bajá las pesas cerca de las piernas hasta un rango cómodo; volvé a pararte."],
    cues: ["Mantené la espalda estable y el peso cerca del cuerpo.", "Sentí el movimiento en las caderas, sin forzar el descenso."],
    caution: "Practicá primero sin carga; si perdés la postura, reducí el recorrido o el peso.",
  },
  {
    id: "jalon-pecho", name: "Jalón al pecho", category: "superior",
    goal: "Entrenar la tracción del tren superior con control.", equipment: "Máquina de polea alta y barra",
    dosage: "Orientativo: 2–3 series de 8–12 repeticiones con resistencia controlable.",
    steps: ["Sentate y sujetá la barra con las manos algo más separadas que los hombros.", "Llevá la barra hacia la parte superior del pecho sin tirones y regresá lentamente."],
    cues: ["Mantené el torso estable sin impulsarte hacia atrás.", "Evitá elevar los hombros o llevar la barra detrás de la cabeza."],
    caution: "Ajustá la carga y el rango para mover los hombros sin molestias.",
  },
  {
    id: "dead-bug", name: "Dead bug", category: "core",
    goal: "Practicar la estabilidad del tronco al mover brazos y piernas.", equipment: "Colchoneta",
    dosage: "Orientativo: 2–3 series de 5–8 repeticiones por lado, lentamente.",
    steps: ["Acostate boca arriba con brazos hacia el techo y caderas y rodillas flexionadas.", "Extendé lentamente un brazo y la pierna opuesta hasta un rango controlable; regresá y alterná."],
    cues: ["Respirá de forma continua y mantené el tronco estable.", "Acortá el movimiento si la espalda se arquea en exceso."],
    caution: "No fuerces la extensión; detenete si aparece dolor.",
  },
  {
    id: "lanzamiento-balon-pecho", name: "Lanzamiento de balón medicinal al pecho", category: "potencia",
    goal: "Practicar una acción explosiva de empuje del tren superior.", equipment: "Balón medicinal liviano y pared apta para lanzamientos",
    dosage: "Orientativo: 2–3 series de 3–5 lanzamientos, descansando para mantener la calidad.",
    steps: ["De pie frente a una pared apta, sostené el balón a la altura del pecho con espacio despejado.", "Lanzalo hacia adelante de forma explosiva y recibí el rebote solo si podés controlarlo."],
    cues: ["Empezá con un balón liviano y una distancia cómoda.", "Mantené una postura equilibrada y preparate para el rebote."],
    caution: "Usá una pared autorizada y despejá el área; no realices el ejercicio si no podés controlar el rebote.",
  },
  {
    id: "desplazamiento-conos", name: "Desplazamiento lateral entre conos", category: "agilidad",
    goal: "Practicar desplazamientos laterales y frenadas controladas.", equipment: "Dos conos y superficie antideslizante",
    dosage: "Orientativo: 2–3 series de 15–20 segundos, con descanso suficiente entre series.",
    steps: ["Colocá dos conos separados por unos pocos pasos y adoptá una semiflexión cómoda.", "Desplazate lateralmente de un cono al otro sin cruzar los pies y frená antes de cambiar de dirección."],
    cues: ["Empezá despacio y aumentá la velocidad solo si conservás el control.", "Mantené espacio entre los pies y evitá golpes bruscos al frenar."],
    caution: "Usá una superficie segura y frená si aparece dolor o perdés el equilibrio.",
  },
  {
    id: "rotacion-toracica", name: "Rotación torácica acostado de lado", category: "movilidad",
    goal: "Explorar la rotación de la parte superior de la espalda.", equipment: "Colchoneta",
    dosage: "Orientativo: 1–2 series de 6–8 movimientos suaves por lado.",
    steps: ["Acostate de lado con las rodillas flexionadas y los brazos extendidos juntos al frente.", "Abrí el brazo superior hacia el otro lado dentro de un rango cómodo y regresá lentamente."],
    cues: ["Dejá que la mirada acompañe la mano si resulta cómodo.", "Mantené las rodillas apoyadas y evitá forzar el hombro."],
    caution: "Reducí el recorrido si sentís molestias y no fuerces la rotación.",
  },
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
