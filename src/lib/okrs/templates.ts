import type { OKRTemplate } from "./types";

export const OKR_TEMPLATES: OKRTemplate[] = [
  // General
  {
    id: "general-activity",
    sport: "general",
    exercise: null,
    title: "Actividad física regular",
    objective: "Mantener un nivel constante de actividad física",
    keyResults: [
      { label: "Velocidad promedio superior a 3 m/s", target: "3", unit: "m/s" },
      { label: "Distancia total superior a 2 km", target: "2", unit: "km" },
      { label: "Nivel de actividad superior al 60%", target: "60", unit: "%" },
    ],
    difficulty: "beginner",
  },
  {
    id: "general-intensity",
    sport: "general",
    exercise: null,
    title: "Progresión de intensidad",
    objective: "Aumentar gradualmente la intensidad del ejercicio",
    keyResults: [
      { label: "Velocidad máxima superior a 5 m/s", target: "5", unit: "m/s" },
      { label: "Períodos de alta intensidad superiores a 30%", target: "30", unit: "%" },
      { label: "Recuperación entre esfuerzos menor a 30s", target: "30", unit: "s" },
    ],
    difficulty: "intermediate",
  },

  // Fútbol
  {
    id: "futbol-possession",
    sport: "futbol",
    exercise: null,
    title: "Dominio del balón",
    objective: "Lograr posesión efectiva superior al 55%",
    keyResults: [
      { label: "Posesión efectiva sobre 55%", target: "55", unit: "%" },
      { label: "Precisión de pase sobre 85%", target: "85", unit: "%" },
    ],
    difficulty: "intermediate",
  },
  {
    id: "futbol-attack",
    sport: "futbol",
    exercise: null,
    title: "Eficiencia ofensiva",
    objective: "Mejorar la conversión de ocasiones de gol",
    keyResults: [
      { label: "Remates a puerta superiores a 14", target: "14", unit: "" },
      { label: "Conversión de ocasiones superior al 25%", target: "25", unit: "%" },
    ],
    difficulty: "advanced",
  },

  // Pádel
  {
    id: "padel-net",
    sport: "padel",
    exercise: null,
    title: "Dominio de red",
    objective: "Mejorar el juego de red y reducir errores",
    keyResults: [
      { label: "Puntos ganados en red superiores a 60%", target: "60", unit: "%" },
      { label: "Errores no forzados inferiores a 8", target: "8", unit: "" },
    ],
    difficulty: "intermediate",
  },

  // Voleibol
  {
    id: "voleibol-attack",
    sport: "voleibol",
    exercise: null,
    title: "Potencia de ataque",
    objective: "Aumentar la efectividad del ataque",
    keyResults: [
      { label: "Remates convertidos superiores al 50%", target: "50", unit: "%" },
      { label: "Bloqueos directos superiores a 3", target: "3", unit: "" },
    ],
    difficulty: "intermediate",
  },

  // Baloncesto
  {
    id: "baloncesto-shooting",
    sport: "baloncesto",
    exercise: null,
    title: "Precisión de tiro",
    objective: "Mejorar el porcentaje de tiro efectivo",
    keyResults: [
      { label: "Tiro de campo superior al 48%", target: "48", unit: "%" },
      { label: "Triples superiores al 36%", target: "36", unit: "%" },
    ],
    difficulty: "intermediate",
  },
  {
    id: "baloncesto-rebounds",
    sport: "baloncesto",
    exercise: null,
    title: "Control del rebote",
    objective: "Dominar el rebote ofensivo y defensivo",
    keyResults: [
      { label: "Rebotes totales superiores a 42", target: "42", unit: "" },
      { label: "Segundas oportunidades superiores a 12", target: "12", unit: "" },
    ],
    difficulty: "advanced",
  },
];
