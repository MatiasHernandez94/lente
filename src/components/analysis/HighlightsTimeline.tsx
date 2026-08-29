import type { Highlight } from "@/lib/analysis/types";
import { ImpactTag } from "@/components/ui/Tag";

export function HighlightsTimeline({ highlights }: { highlights: Highlight[] }) {
  return (
    <ol className="timeline-rail space-y-0">
      {highlights.map((item, index) => (
        <li key={`${item.minute}-${index}`} className="relative pl-8 pb-6 last:pb-0">
          <span
            aria-hidden="true"
            className="absolute top-[5px] left-0 size-[9px] rounded-full border border-ink bg-canvas"
            style={{ backgroundColor: item.impact === "alta" ? "var(--ink)" : "var(--canvas)" }}
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="table-num text-xs font-medium tracking-wide text-muted">{item.minute}</span>
            <ImpactTag impact={item.impact} />
            <span className="label text-muted">{item.category}</span>
          </div>
          <h4 className="mt-1 text-[15px] font-medium text-ink">{item.title}</h4>
          <p className="mt-0.5 text-sm leading-6 text-muted">{item.detail}</p>
        </li>
      ))}
    </ol>
  );
}