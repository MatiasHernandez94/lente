import type { Metric } from "@/lib/analysis/types";

export function MetricBar({ metric }: { metric: Metric }) {
  return (
    <div className="border-b border-hairline py-4 first:pt-0 last:border-b-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm text-ink">{metric.label}</span>
        <span className="table-num text-sm font-semibold text-ink">
          {metric.value}
          <span className="ml-1 text-xs font-normal text-soft">{metric.unit}</span>
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-4">
        <span className="text-[11px] tracking-wide text-soft">Meta {metric.target}</span>
        <span className="table-num text-[11px] tracking-wide text-muted">{metric.rating} %</span>
      </div>
      <div className="mt-2 h-[3px] w-full bg-surface-2" role="presentation">
        <div
          className="h-full bg-ink transition-[width] duration-500"
          style={{ width: `${Math.min(100, Math.max(0, metric.rating))}%` }}
        />
      </div>
    </div>
  );
}