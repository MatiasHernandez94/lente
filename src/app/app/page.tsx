import type { Metadata } from "next";
import Link from "next/link";
import { Plus, ArrowRight } from "lucide-react";
import { DemoExamplesButton } from "@/components/app/DemoExamplesButton";
import { SportTag } from "@/components/ui/Tag";
import { getSessionUser } from "@/lib/session";
import { listUserVideos } from "@/lib/services/videoService";
import { formatShortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Resumen" };

interface StatCardProps {
  label: string;
  value: string | number;
  detail: string;
}

function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <div className="border border-hairline bg-canvas px-5 py-4">
      <span className="label text-muted">{label}</span>
      <p className="table-num mt-1 text-3xl font-semibold tracking-tight text-ink">{value}</p>
      <p className="mt-1 text-xs text-soft">{detail}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await getSessionUser();
  const videos = user ? listUserVideos(user.id) : [];

  const ready = videos.filter((video) => video.status === "ready");
  const pending = videos.filter((video) => video.status === "pending" || video.status === "analyzing");
  const averageScore = ready.length
    ? Math.round(ready.reduce((acc, video) => acc + (video.analysis?.score ?? 0), 0) / ready.length)
    : 0;
  const topRated = [...ready]
    .sort((a, b) => (b.analysis?.score ?? 0) - (a.analysis?.score ?? 0))
    .slice(0, 4);
  const hasData = videos.length > 0;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label mb-2 text-muted">Panel de análisis</p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Buen día, {user?.name.split(" ")[0] ?? "usuario"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            Resumen de su material registrado y rendimiento estimado por análisis.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DemoExamplesButton />
          <Link
            href="/app/nuevo"
            className="inline-flex items-center gap-2 bg-ink px-5 py-2.5 text-sm font-medium text-canvas transition-colors hover:bg-muted"
          >
            <Plus size={15} strokeWidth={2} aria-hidden="true" /> Nuevo análisis
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-px border border-hairline bg-hairline lg:grid-cols-4" aria-label="Estadísticas">
        <StatCard label="Videos registrados" value={videos.length} detail="Total del acervo" />
        <StatCard label="Análisis listos" value={ready.length} detail="Procesados para su revisión" />
        <StatCard label="En proceso" value={pending.length} detail="Pendientes de analizar" />
        <StatCard label="Puntaje promedio" value={hasData ? averageScore : "—"} detail="Sobre 100" />
      </section>

      {!hasData ? (
        <section className="border border-hairline bg-surface px-6 py-16 text-center">
          <h2 className="text-lg font-medium text-ink">Su panel está en blanco</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
            Registre su primer análisis de fútbol, pádel, voleibol o baloncesto, o cargue ejemplos de demostración
            para visualizar la estructura de resultados.
          </p>
        </section>
      ) : (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-medium text-ink">Mejor puntuados</h2>
            {videos.length > 4 ? (
              <Link href="/app/videos" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:underline">
                Ver todos <ArrowRight size={14} strokeWidth={1.8} aria-hidden="true" />
              </Link>
            ) : null}
          </div>
          {topRated.length === 0 ? (
            <div className="border border-hairline bg-surface px-6 py-10 text-center">
              <p className="text-sm text-muted">Analice su primer video para ver resultados aquí.</p>
            </div>
          ) : (
            <div className="grid gap-px border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
              {topRated.map((video) => (
                <Link
                  key={video.id}
                  href={`/app/videos/${video.id}`}
                  className="group flex flex-col justify-between gap-6 bg-canvas px-5 py-5 transition-colors hover:bg-surface"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <SportTag sport={video.sport} />
                    </div>
                    <h3 className="mt-3 line-clamp-2 text-[15px] font-medium leading-6 text-ink group-hover:underline">
                      {video.title}
                    </h3>
                    <p className="mt-1 text-[11px] tracking-wide text-soft">{formatShortDate(video.createdAt)}</p>
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="label text-muted">Puntaje</span>
                    <span className="table-num text-2xl font-semibold tracking-tight text-ink">
                      {video.analysis?.score ?? "—"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}