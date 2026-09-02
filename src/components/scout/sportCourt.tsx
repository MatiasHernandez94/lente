import type { Sport } from "@/lib/analysis/types";

interface SportCourtSvgProps {
  sport: Sport;
  stroke?: string;
  width: number;
  height: number;
}

function FootballLines({ stroke }: { stroke: string }) {
  return (
    <g stroke={stroke} strokeWidth={0.18} fill="none" shapeRendering="geometricPrecision">
      <rect x={0} y={0} width={105} height={68} />
      <line x1={52.5} y1={0} x2={52.5} y2={68} />
      <circle cx={52.5} cy={34} r={9.15} />
      <rect x={0} y={13.85} width={16.5} height={40.3} />
      <rect x={0} y={24.84} width={5.5} height={18.32} />
      <rect x={88.5} y={13.85} width={16.5} height={40.3} />
      <rect x={99.5} y={24.84} width={5.5} height={18.32} />
      <path d="M16.5 24.85 A9.15 9.15 0 0 0 16.5 43.15" />
      <path d="M88.5 24.85 A9.15 9.15 0 0 1 88.5 43.15" />
    </g>
  );
}

function BasketballLines({ stroke }: { stroke: string }) {
  return (
    <g stroke={stroke} strokeWidth={0.07} fill="none" shapeRendering="geometricPrecision">
      <rect x={0} y={0} width={28} height={15} />
      <line x1={14} y1={0} x2={14} y2={15} />
      <circle cx={14} cy={7.5} r={1.8} />
      <rect x={0} y={5.05} width={5.7} height={4.9} />
      <rect x={22.3} y={5.05} width={5.7} height={4.9} />
      <path d="M5.7 5.7 A1.8 1.8 0 0 1 5.7 9.3" />
      <path d="M22.3 5.7 A1.8 1.8 0 0 0 22.3 9.3" />
      <path d="M0 6.6 L6.44 6.6 A6.6 6.6 0 0 1 6.44 8.4 L0 8.4" />
      <path d="M28 6.6 L21.56 6.6 A6.6 6.6 0 0 0 21.56 8.4 L28 8.4" />
      <path d="M0 6.25 A1.25 1.25 0 0 1 0 8.75" />
      <path d="M28 6.25 A1.25 1.25 0 0 0 28 8.75" />
      <circle cx={0} cy={7.5} r={0.6} />
      <circle cx={28} cy={7.5} r={0.6} />
    </g>
  );
}

function PadelLines({ stroke }: { stroke: string }) {
  return (
    <g stroke={stroke} strokeWidth={0.08} fill="none" shapeRendering="geometricPrecision">
      <rect x={0} y={0} width={20} height={10} />
      <line x1={10} y1={0} x2={10} y2={10} />
      <line x1={0} y1={3} x2={10} y2={3} />
      <line x1={10} y1={3} x2={20} y2={3} />
      <line x1={0} y1={7} x2={10} y2={7} />
      <line x1={10} y1={7} x2={20} y2={7} />
      <line x1={3} y1={0} x2={3} y2={3} />
      <line x1={3} y1={7} x2={3} y2={10} />
      <line x1={17} y1={0} x2={17} y2={3} />
      <line x1={17} y1={7} x2={17} y2={10} />
    </g>
  );
}

function VolleyballLines({ stroke }: { stroke: string }) {
  return (
    <g stroke={stroke} strokeWidth={0.08} fill="none" shapeRendering="geometricPrecision">
      <rect x={0} y={0} width={18} height={9} />
      <line x1={9} y1={0} x2={9} y2={9} />
      <line x1={0} y1={3} x2={9} y2={3} />
      <line x1={9} y1={3} x2={18} y2={3} />
      <line x1={0} y1={6} x2={9} y2={6} />
      <line x1={9} y1={6} x2={18} y2={6} />
    </g>
  );
}

export function SportCourtSvg({ sport, stroke = "currentColor", width, height }: SportCourtSvgProps) {
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none">
      {sport === "futbol" ? <FootballLines stroke={stroke} /> : null}
      {sport === "baloncesto" ? <BasketballLines stroke={stroke} /> : null}
      {sport === "padel" ? <PadelLines stroke={stroke} /> : null}
      {sport === "voleibol" ? <VolleyballLines stroke={stroke} /> : null}
    </svg>
  );
}
