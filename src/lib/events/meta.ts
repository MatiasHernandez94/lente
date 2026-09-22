import type { Sport } from "@/lib/analysis/types";

export type EventType =
  | "made"
  | "missed"
  | "assist"
  | "rebound"
  | "turnover"
  | "foul"
  | "pause";

export type EventsTeam = "A" | "B";

export interface VideoEvent {
  id: string;
  videoId: string;
  team: EventsTeam;
  player: string;
  eventType: EventType;
  x: number;
  y: number;
  t: number;
  points: number | null;
  createdAt: string;
}

export const EVENT_TYPES_BY_SPORT: Record<Sport, EventType[]> = {
  general: ["made", "missed", "assist", "turnover", "foul", "pause"],
  baloncesto: ["made", "missed", "assist", "rebound", "turnover", "foul", "pause"],
  futbol: ["made", "missed", "assist", "turnover", "foul", "pause"],
  padel: ["made", "missed", "assist", "turnover", "pause"],
  voleibol: ["made", "missed", "assist", "turnover", "pause"],
};

const BASE_LABELS: Record<EventType, string> = {
  made: "Punto convertido",
  missed: "Punto fallado",
  assist: "Asistencia",
  rebound: "Rebote",
  turnover: "Pérdida",
  foul: "Falta",
  pause: "Tiempo muerto",
};

export const EVENT_LABELS_BY_SPORT: Record<Sport, Record<EventType, string>> = {
  general: { ...BASE_LABELS },
  baloncesto: { ...BASE_LABELS },
  futbol: {
    ...BASE_LABELS,
    made: "Gol",
    missed: "Gol fallado",
    rebound: "Recuperación",
  },
  padel: { ...BASE_LABELS, made: "Punto", missed: "Error", rebound: "Volea ganadora" },
  voleibol: { ...BASE_LABELS, made: "Punto", missed: "Error", rebound: "Defensa" },
};

export function eventLabel(sport: Sport, eventType: EventType): string {
  return EVENT_LABELS_BY_SPORT[sport][eventType];
}

export const COURT_BOUNDS: Record<"baloncesto" | "futbol", { width: number; height: number }> = {
  baloncesto: { width: 28.65, height: 15.24 },
  futbol: { width: 105, height: 68 },
};

export function courtBounds(sport: Sport): { width: number; height: number } {
  if (sport === "futbol") return COURT_BOUNDS.futbol;
  return COURT_BOUNDS.baloncesto;
}

export function supportsRealCourt(sport: Sport): boolean {
  return sport === "baloncesto" || sport === "futbol";
}