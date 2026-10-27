interface StatCardProps {
  label: string;
  value: string | number;
  detail: string;
}

export function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <div className="border border-hairline bg-canvas px-5 py-4">
      <span className="label text-muted">{label}</span>
      <p className="table-num mt-1 text-3xl font-semibold tracking-tight text-ink">{value}</p>
      <p className="mt-1 text-xs text-soft">{detail}</p>
    </div>
  );
}
