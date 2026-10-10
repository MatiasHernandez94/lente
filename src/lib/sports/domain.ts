import type { Sport } from "@/lib/analysis/types";

/**
 * Conocimiento curado por deporte que se inyecta en los prompts del agente IA.
 *
 * La idea es que el modelo deje de razonar "de memoria" y use contextos tácticos
 * y biomecánicos verificados: posiciones, en qué fijarse en el video, KPIs
 * relevantes, errores típicos y pautas de entrenamiento. Se usa tanto para la
 * detección del deporte (pistas visuales) como para mejoras, informe de coach
 * y chat.
 */
export interface SportKnowledge {
  /** Pistas visuales para reconocer el deporte en fotogramas. */
  visualClues: string;
  /** Roles / posiciones en cancha. */
  positions: string;
  /** En qué fijarse al ver el video (táctico y biomecánico). */
  focusAreas: string[];
  /** Métricas (KPIs) relevantes para el deporte. */
  kpis: string[];
  /** Errores frecuentes que conviene buscar y corregir. */
  commonErrors: string[];
  /** Pautas de entrenamiento (cues/drills) para el coach. */
  cues: string[];
}

export const SPORT_KNOWLEDGE: Record<Sport, SportKnowledge> = {
  futbol: {
    visualClues:
      "11 jugadores por equipo en una cancha grande con césped, dos arcos a los lados, círculo central y líneas de área.",
    positions:
      "Arquero, defensores (centrales y laterales), mediocampistas (volante 5 y 8), extremos y delanteros (punta).",
    focusAreas: [
      "líneas de presión y profundidad",
      "coberturas y relevos defensivos",
      "orientación del cuerpo al recibir el balón",
      "desmarques y ocupación de espacios entre líneas",
      "transiciones ataque-defensa y defensa-ataque",
      "balón parado y segundas jugadas",
    ],
    kpis: [
      "posesión",
      "distancia y velocidad (sprints)",
      "intensidad por zonas",
      "formación y estructura",
      "eventos de presión y transiciones",
    ],
    commonErrors: [
      "llegar tarde a la presión y abrir el centro",
      "pérdida de marca en la segunda línea",
      "falta de amplitud al atacar",
      "espalda abierta en el mediocampo (no jugar de frente)",
      "repliegue ordenado tras pérdida",
      "no bascular en bloque",
    ],
    cues: [
      "cerrar el lado contrario a la presión",
      "primer pase rápido tras la recuperación",
      "bascular en bloque y cubrir relevos",
      "jugar de frente (amagar con el cuerpo antes de recibir)",
    ],
  },
  baloncesto: {
    visualClues:
      "Cancha con parquet o sintético, dos aros con tablero, línea de 3 puntos, círculo central y 5 jugadores por equipo.",
    positions: "Base, escolta, alero, ala-pívot y pívot.",
    focusAreas: [
      "espaciado y triángulos de pase",
      "ayuda defensiva y rotaciones",
      "box out (encajonamiento) en rebote defensivo",
      "transición ofensiva y vuelta defensiva",
      "pick & roll (bloqueador y manejo del balón)",
      "bloqueos indirectos y corte hacia canasta",
    ],
    kpis: [
      "velocidad y cambio de ritmo",
      "distancia recorrida y aceleraciones",
      "posesión",
      "eventos de intensidad (sprints)",
      "rebotes/segundas oportunidades",
    ],
    commonErrors: [
      "pintura congestionada por mal espaciado",
      "ayuda tardía del pívot ante penetraciones",
      "box out pasivo en los tiros libres",
      "contraataque con dos jugadores en el mismo carril",
      "mal sellado del pick & roll",
      "quedar sin balance defensivo tras el tiro",
    ],
    cues: [
      "encajonar (box out) siempre antes de mirar el aro",
      "espaciar perímetro y pintura (5 out)",
      "transición con primera descarga al medio y aleros por las bandas",
      "hacer el bloqueo fuerte y soltar temprano",
    ],
  },
  padel: {
    visualClues:
      "Pista cerrada con piso sintético, paredes y cristales, separada por una red baja; se juega de a parejas.",
    positions: "Parejas: la dupla de la red cuadrada en zona y la del fondo cubriendo los globos.",
    focusAreas: [
      "armado de la pala (posición de la mano y altura)",
      "posición de la pareja: quién cubre el medio y quién la pared",
      "globos y salidas a la red",
      "bandeja y víbora (golpes por arriba)",
      "presión en el medio de la cancha",
      "lectura de los rebotes en pared y cristal",
    ],
    kpis: [
      "puntos ganados/perdidos en red vs fondo",
      "errores no forzados",
      "profundidad de los golpes",
      "cobertura de la pareja",
    ],
    commonErrors: [
      "quedar a media cancha después de su globo",
      "pala baja en la red",
      "no cuadrarse con la pareja (dejar el medio libre)",
      "golpear tras la línea de saque sin subir a la red",
      "dejarse comer el medio en los puntos definidos",
    ],
    cues: [
      "cuadrarse con la pareja después de cada golpe",
      "anticiparse a los dos rebotes (sencillo y pared)",
      "subir a la red juntos (no en solitario)",
      "jugar la pelota frente al cuerpo, no atrás",
    ],
  },
  voleibol: {
    visualClues:
      "Cancha dividida por una red alta; 6 jugadores por equipo; la pelota no toca el piso dentro de los límites.",
    positions: "Colocador, opuesto, puntas, centrales y líbero.",
    focusAreas: [
      "recepción (pase de antebrazos con ángulo al colocador)",
      "construcción del ataque y altura del pase",
      "bloqueo individual y de equipo (cierre de manos)",
      "defensa de cancha y cobertura del atacante",
      "rotaciones y posicionamiento tras el saque",
      "transición defensa-ataque rápida",
    ],
    kpis: [
      "tiempo de reacción en bloqueo",
      "defensa de campo",
      "calidad de la primera recepción",
      "intensidad de saltos",
    ],
    commonErrors: [
      "bloqueo con manos separadas",
      "no cubrir la punta de red",
      "recepción con brazos rígidos sin ángulo hacia el colocador",
      "rotar tarde después del saque",
      "quedar sin cobertura tras el ataque",
    ],
    cues: [
      "brazos juntos y ángulo hacia el colocador",
      "los delanteros bloquean cerrando las puntas",
      "cobertura al atacante en bloqueo",
      "transición rápida tras la defensa",
    ],
  },
  general: {
    visualClues:
      "Sin deporte estandarizado claro: entrenamiento libre, gimnasio, running o actividad sin cancha reglamentaria.",
    positions: "Sin estructura de equipo fija: ciclo individual, técnica de ejercicio y volumen.",
    focusAreas: [
      "rango de movimiento y técnica de ejecución",
      "ritmo y pausas",
      "compensaciones posturales",
      "control de la velocidad del movimiento",
    ],
    kpis: [
      "intensidad",
      "repeticiones",
      "distancia y velocidad",
      "desgaste y riesgo",
    ],
    commonErrors: [
      "compensaciones con la espalda",
      "rango incompleto por peso excesivo",
      "ritmo desigual (explosivo de más o pausas largas)",
    ],
    cues: [
      "priorizá técnica sobre carga",
      "mantené el core activo en cada repetición",
      "respirá en el patrón correcto del ejercicio",
    ],
  },
};

/** Bloque de conocimiento que se inyecta en los prompts de análisis. */
export function sportKnowledgeBlock(sport: Sport, compact = false): string {
  const knowledge = SPORT_KNOWLEDGE[sport] ?? SPORT_KNOWLEDGE.general;
  if (compact) {
    return [
      `- Posiciones/roles: ${knowledge.positions}`,
      `- En qué fijarte: ${knowledge.focusAreas.slice(0, 4).join(", ")}`,
      `- Errores típicos: ${knowledge.commonErrors.slice(0, 4).join(", ")}`,
    ].join("\n");
  }
  return [
    `Posiciones/roles: ${knowledge.positions}`,
    `En qué fijarte en el video: ${knowledge.focusAreas.join("; ")}.`,
    `KPIs relevantes: ${knowledge.kpis.join(", ")}.`,
    `Errores típicos a buscar: ${knowledge.commonErrors.join("; ")}.`,
    `Pautas de entrenamiento: ${knowledge.cues.join("; ")}.`,
  ]
    .map((line) => `- ${line}`)
    .join("\n");
}

/** Pistas visuales por deporte para el agente de detección. */
export function sportVisualClues(sport: Sport): string {
  return (SPORT_KNOWLEDGE[sport] ?? SPORT_KNOWLEDGE.general).visualClues;
}