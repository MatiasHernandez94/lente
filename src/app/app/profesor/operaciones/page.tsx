import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Activity, CheckCircle2, Clock, XCircle } from "lucide-react";
import { getSessionUser } from "@/lib/session";
import { getOpsStats, listRecentJobs, type OpsJobRow } from "@/lib/ops/service";
import { formatDateTime } from "@/lib/format";
import { ReintentarJobButton } from "@/components/app/ReintentarJobButton";

export const metadata: Metadata = { title: "Operaciones" };

const STATUS_LABEL: Record<string, string> = {
  pending: "En cola",
  processing: "Procesando",
  done: "Completado",
  error: "Error",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  processing: "bg-sky-100 text-sky-800",
  done: "bg-emerald-100 text-emerald-800",
  error: "bg-red-100 text-red-800",
};

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms > 60_000) return `${Math.round(ms / 60_000)} min`;
  return `${Math.round(ms / 1000)} s`;
}

function JobRow({ job }: { job: OpsJobRow }) {
  const isError = job.status === "error";
  return (
    <tr className="border-t border-hairline">
      <td className="px-3 py-2.5 text-xs text-muted">{String(job.videoTitle || job.videoId).slice(0, 26)}</td>
      <td className="px-3 py-2.5 text-xs">{job.kind}</td>
      <td className="px-3 py-2.5">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[job.status] ?? "bg-surface text-muted"}`}>
          {STATUS_LABEL[job.status] ?? job.status}
        </span>
      </td>
      <td className="px-3 py-2.5 text-xs text-muted">{job.attempts}×</td>
      <td className="px-3 py-2.5 text-xs text-muted">
        {job.status === "processing"
          ? "ahora"
          : job.finishedAt
            ? formatDateTime(job.finishedAt)
            : job.runAfter
              ? `~${formatDateTime(job.runAfter)}`
              : formatDateTime(job.createdAt)}
      </td>
      <td className="px-3 py-2.5">
        {isError ? (
          <div className="flex items-center gap-2">
            <ReintentarJobButton jobId={job.id} />
            {job.error?.message ? <span className="max-w-[220px] truncate text-[11px] text-red-600" title={String(job.error.message)}>{String(job.error.message)}</span> : null}
          </div>
        ) : null}
      </td>
    </tr>
  );
}

export default async function OperacionesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.rol !== "profesor") redirect("/app");

  const [jobs, stats] = await Promise.all([listRecentJobs(user.id, 50), getOpsStats(user.id)]);

  const cards = [
    { label: "Videos totales", value: String(stats.videosTotal), icon: Activity, tone: "text-ink" },
    { label: "Jobs últ. 7 días", value: String(stats.jobsLast7d), icon: Clock, tone: "text-ink" },
    { label: "Completados", value: String(stats.doneTotal), icon: CheckCircle2, tone: "text-emerald-600" },
    { label: "Errores", value: String(stats.errorTotal), icon: XCircle, tone: stats.errorTotal > 0 ? "text-red-600" : "text-muted" },
  ];

  return (
    <div className="space-y-8">
      <header>
        <p className="label mb-2 text-muted">Panel del profesor</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Operaciones</h1>
        <p className="mt-2 text-sm text-muted">
          Estado de la cola de procesamiento, tiempos y errores. Los trabajos con error se reintentan automáticamente y podés forzar el reintento.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-px border border-hairline bg-hairline lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="flex items-center gap-3 bg-canvas px-5 py-4">
            <Icon size={20} strokeWidth={1.6} className={tone} aria-hidden="true" />
            <div>
              <p className="text-lg font-semibold leading-6 text-ink">{value}</p>
              <p className="text-[11px] text-muted">{label}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="border border-hairline bg-surface">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <h2 className="text-sm font-medium text-ink">Trabajos recientes</h2>
          <span className="text-[11px] text-muted">Tiempo medio por trabajo: {formatMs(stats.meanDoneMs)}</span>
        </div>
        {jobs.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">Todavía no hay trabajos registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Video</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Intentos</th>
                  <th className="px-3 py-2 font-medium">Última actividad</th>
                  <th className="px-3 py-2 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <JobRow key={job.id} job={job} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}