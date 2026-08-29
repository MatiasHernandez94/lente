import type { Okr } from "@/lib/analysis/types";
import { Target } from "lucide-react";

export function OkrCard({ okr }: { okr: Okr }) {
  const progress = Math.min(100, Math.max(0, okr.progress));
  const status = progress >= 80 ? "Superado" : progress >= 50 ? "En curso" : "Por iniciar";

  return (
    <article className="border border-hairline bg-canvas">
      <div className="flex items-start justify-between border-b border-hairline px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Target size={16} strokeWidth={1.8} className="text-muted" aria-hidden="true" />
          <h3 className="text-[15px] font-medium text-ink">{okr.objective}</h3>
        </div>
        <span className="label text-muted">{status}</span>
      </div>

      <ul className="px-5 py-2">
        {okr.keyResults.map((kr) => (
          <li key={kr.label} className="flex items-baseline justify-between gap-4 border-b border-hairline py-2.5 last:border-b-0">
            <span className="text-sm text-muted">{kr.label}</span>
            <span className="table-num text-sm text-ink">
              <span className="font-semibold">{kr.value}</span>
              <span className="ml-1 text-xs text-soft">/ {kr.target}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="px-5 pb-4">
        <div className="h-[3px] w-full bg-surface-2" role="presentation">
          <div className="h-full bg-ink" style={{ width: `${progress}%` }} />
        </div>
        <p className="table-num mt-1.5 text-right text-[11px] tracking-wide text-soft">{progress} % cumplimiento</p>
      </div>
    </article>
  );
}