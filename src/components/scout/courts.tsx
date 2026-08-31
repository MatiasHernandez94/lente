interface CourtSvgProps {
  stroke?: string;
}

export function BasketballCourtSvg({ stroke = "currentColor" }: CourtSvgProps) {
  return (
    <svg viewBox="0 0 28.65 15.24" className="h-full w-full" preserveAspectRatio="none">
      <g stroke={stroke} strokeWidth={0.07} fill="none" shapeRendering="geometricPrecision">
        <rect x={0.1} y={0.1} width={28.45} height={15.04} />
        <line x1={14.325} y1={0.1} x2={14.325} y2={15.14} />
        <circle cx={14.325} cy={7.62} r={1.8} />
        <rect x={0.1} y={5.17} width={5.7} height={4.9} />
        <rect x={22.85} y={5.17} width={5.7} height={4.9} />
        <path d="M5.8 5.82 A1.8 1.8 0 0 1 5.8 9.42" />
        <path d="M22.85 5.82 A1.8 1.8 0 0 0 22.85 9.42" />
        <path d="M0.1 6.72 L6.54 6.72 A6.6 6.6 0 0 1 6.54 8.52 L0.1 8.52" />
        <path d="M28.55 6.72 L22.11 6.72 A6.6 6.6 0 0 0 22.11 8.52 L28.55 8.52" />
        <path d="M0.1 6.37 A1.25 1.25 0 0 1 0.1 8.87" />
        <path d="M28.55 6.37 A1.25 1.25 0 0 0 28.55 8.87" />
      </g>
      <g stroke={stroke} strokeWidth={0.09} fill={stroke}>
        <circle cx={0.1} cy={7.62} r={0.6} />
        <circle cx={28.55} cy={7.62} r={0.6} />
      </g>
    </svg>
  );
}

export function FootballPitchSvg({ stroke = "currentColor" }: CourtSvgProps) {
  return (
    <svg viewBox="0 0 105 68" className="h-full w-full" preserveAspectRatio="none">
      <g stroke={stroke} strokeWidth={0.2} fill="none" shapeRendering="geometricPrecision">
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
      <g fill={stroke}>
        <circle cx={52.5} cy={34} r={0.45} />
        <circle cx={11} cy={34} r={0.45} />
        <circle cx={94} cy={34} r={0.45} />
      </g>
    </svg>
  );
}