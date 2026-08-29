import type { Sport } from "./analysis/types";

export const PLAYER_LABEL: Record<Sport, string> = {
  futbol: "Once contra once",
  padel: "Dos contra dos",
  voleibol: "Seis contra seis",
  baloncesto: "Cinco contra cinco",
};

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatShortDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

export function formatDurationSeconds(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  return `${minutes} min`;
}