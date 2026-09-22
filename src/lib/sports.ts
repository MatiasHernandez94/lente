import type { Sport, SourceType } from "./analysis/types";

export interface SportInfo {
  value: Sport;
  label: string;
  description: string;
}

export const SPORTS: SportInfo[] = [
  {
    value: "general",
    label: "General",
    description: "Análisis universal: detección de personas, movimiento y métricas generales.",
  },
  {
    value: "futbol",
    label: "Fútbol",
    description: "Once contra once. Análisis de posesión, creación y definición.",
  },
  {
    value: "padel",
    label: "Pádel",
    description: "Juego de pared y red. Análisis de ataque, red y errores.",
  },
  {
    value: "voleibol",
    label: "Voleibol",
    description: "Seis contra seis. Análisis de ataque, bloqueo y recepción.",
  },
  {
    value: "baloncesto",
    label: "Baloncesto",
    description: "Análisis de tiro, ritmo, rebote y creación de juego.",
  },
];

export const SPORT_LABEL: Record<Sport, string> = Object.fromEntries(
  SPORTS.map((s) => [s.value, s.label]),
) as Record<Sport, string>;

export const SOURCE_LABEL: Record<SourceType, string> = {
  camera: "Cámara",
  upload: "Subida",
  youtube: "YouTube",
};