import type { Impact, SourceType, VideoStatus } from "@/lib/analysis/types";
import { SOURCE_LABEL, SPORT_LABEL } from "@/lib/sports";
import type { Sport } from "@/lib/analysis/types";

const SPORT_TONES: Record<Sport, string> = {
  general: "border-ink/25 text-ink",
  futbol: "border-ink/25 text-ink",
  padel: "border-ink/25 text-ink",
  voleibol: "border-ink/25 text-ink",
  baloncesto: "border-ink/25 text-ink",
};

const STATUS_TONES: Record<VideoStatus, string> = {
  pending: "text-muted border-ink/15",
  analyzing: "text-muted border-ink/15",
  ready: "text-ink border-ink/30",
  error: "text-red-900 border-red-900/30",
};

const STATUS_LABEL: Record<VideoStatus, string> = {
  pending: "Pendiente",
  analyzing: "Analizando",
  ready: "Listo",
  error: "Error",
};

const IMPACT_LABEL: Record<Impact, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

interface TagProps {
  children: React.ReactNode;
  tone?: string;
}

function Tag({ children, tone = "text-muted border-ink/15" }: TagProps) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap border px-2 py-[3px] text-[11px] font-medium tracking-wide ${tone}`}
    >
      {children}
    </span>
  );
}

export function SportTag({ sport }: { sport: Sport }) {
  return <Tag tone={SPORT_TONES[sport]}>{SPORT_LABEL[sport]}</Tag>;
}

export function SourceTag({ source }: { source: SourceType }) {
  return <Tag>{SOURCE_LABEL[source]}</Tag>;
}

export function StatusTag({ status }: { status: VideoStatus }) {
  const pulse = status === "analyzing" ? "animate-pulse" : "";
  return (
    <Tag tone={STATUS_TONES[status]}>
      <span className={`${pulse}`}>{STATUS_LABEL[status]}</span>
    </Tag>
  );
}

export function ImpactTag({ impact }: { impact: Impact }) {
  return <Tag tone={impact === "alta" ? "bg-ink text-canvas border-ink" : undefined}>{IMPACT_LABEL[impact]}</Tag>;
}