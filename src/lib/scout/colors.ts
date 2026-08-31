import type { ScoutTeamKey } from "./types";

export const TEAM_COLORS: Record<
  ScoutTeamKey,
  { stroke: string; fill: string; label: string }
> = {
  A: { stroke: "#10b981", fill: "rgba(16,185,129,0.20)", label: "Equipo A" },
  B: { stroke: "#f59e0b", fill: "rgba(245,158,11,0.22)", label: "Equipo B" },
};

export const UNASSIGNED_COLOR = { stroke: "#e5e5e5", fill: "rgba(229,229,229,0.14)" };
export const SELECTED_COLOR = { stroke: "#ffffff", fill: "rgba(255,255,255,0.24)" };