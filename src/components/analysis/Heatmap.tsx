import type { HeatZone } from "@/lib/analysis/types";

interface HeatmapProps {
  zones: HeatZone[];
}

export function Heatmap({ zones }: HeatmapProps) {
  const cols = Math.max(...zones.map((zone) => zone.col)) + 1;
  const rows = Math.max(...zones.map((zone) => zone.row)) + 1;
  const midRow = rows / 2;

  return (
    <svg
      viewBox={`0 0 ${cols} ${rows}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Mapa de calor del jugador"
      className="aspect-[14/9] w-full bg-surface-2"
    >
      {zones.map((zone) => (
        <rect
          key={`${zone.col}-${zone.row}`}
          x={zone.col}
          y={zone.row}
          width={1}
          height={1}
          fill={`rgba(20, 20, 19, ${zone.intensity.toFixed(2)})`}
        />
      ))}
      <rect x={0} y={midRow - 0.035} width={cols} height={0.07} fill="rgba(244, 243, 241, 0.9)" />
    </svg>
  );
}