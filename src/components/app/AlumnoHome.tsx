import Link from "next/link";
import { Plus, ArrowRight, MessageSquare } from "lucide-react";
import { DemoExamplesButton } from "@/components/app/DemoExamplesButton";
import { StatCard } from "@/components/app/StatCard";
import { SportTag } from "@/components/ui/Tag";
import { listUserVideos } from "@/lib/services/videoService";
import { listCorreccionesByAlumno } from "@/lib/correccion/service";
import { formatShortDate } from "@/lib/format";
import type { UserRow } from "@/lib/schema";

interface AlumnoHomeProps {
  user: UserRow;
}

export async function AlumnoHome({ user }: AlumnoHomeProps) {
  const [videos, correcciones] = await Promise.all([
    listUserVideos(user.id),
    listCorreccionesByAlumno(user.id),
  ]);

  const ready = videos.filter((video) => video.status === "ready");
  const averageScore = ready.length
    ? Math.round(ready.reduce((acc, video) => acc + (video.analysis?.score ?? 0), 0) / ready.length)
    : 0;
  const recientes = [...videos]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 4);
  const feedback = correcciones.slice(0, 5);
  const hasVideos = videos.length > 0;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label mb-2 text-muted">Mi entrenamiento</p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Buen día, {user.name.split(" ")[0] ?? "jugador"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            Tus videos, las correcciones de tus profesores y tus objetivos en un solo lugar.
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
        <StatCard label="Mis videos" value={videos.length} detail="Material propio" />
        <StatCard label="Análisis listos" value={ready.length} detail="Listos para revisar" />
        <StatCard label="Correcciones" value={correcciones.length} detail="De tus profesores" />
        <StatCard label="Puntaje promedio" value={hasVideos ? averageScore : "—"} detail="Sobre 100" />
      </section>

      <section aria-label="Correcciones de tus profesores">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-medium text-ink">Correcciones de tus profesores</h2>
          <Link
            href="/app/videos"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:underline"
          >
            Ver mis videos <ArrowRight size={14} strokeWidth={1.8} aria-hidden="true" />
          </Link>
        </div>
        {feedback.length === 0 ? (
          <div className="border border-hairline bg-surface px-6 py-10 text-center">
            <MessageSquare size={26} strokeWidth={1.5} className="mx-auto text-muted" aria-hidden="true" />
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
              Cuando tus profesores dejen correcciones en tus videos, las vas a ver acá.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {feedback.map((correccion) => (
              <li key={correccion.id} className="border border-hairline bg-canvas p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-ink">{correccion.profesorName}</p>
                    <Link
                      href={`/app/videos/${correccion.videoId}`}
                      className="mt-0.5 block text-[12px] text-muted underline-offset-4 hover:text-ink hover:underline"
                    >
                      {correccion.videoTitle}
                    </Link>
                  </div>
                  {correccion.minutoInicio !== null ? (
                    <Link
                      href={`/app/videos/${correccion.videoId}?t=${correccion.minutoInicio * 60}`}
                      className="label whitespace-nowrap text-soft underline underline-offset-4 hover:text-ink"
                      title="Ver el video en ese instante"
                    >
                      min {correccion.minutoInicio}
                    </Link>
                  ) : (
                    <span className="label whitespace-nowrap text-soft">{formatShortDate(correccion.createdAt)}</span>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted">{correccion.mensaje}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Mis videos">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-medium text-ink">Mis videos</h2>
          {hasVideos ? (
            <Link
              href="/app/videos"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:underline"
            >
              Ver todos <ArrowRight size={14} strokeWidth={1.8} aria-hidden="true" />
            </Link>
          ) : null}
        </div>
        {!hasVideos ? (
          <div className="border border-hairline bg-surface px-6 py-16 text-center">
            <h2 className="text-lg font-medium text-ink">Todavía no registraste videos</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
              Subí tu primer video de fútbol, pádel, voleibol o baloncesto y tu profesor podrá dejar correcciones.
            </p>
          </div>
        ) : (
          <div className="grid gap-px border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
            {recientes.map((video) => (
              <Link
                key={video.id}
                href={`/app/videos/${video.id}`}
                className="group flex flex-col justify-between gap-6 bg-canvas px-5 py-5 transition-colors hover:bg-surface"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <SportTag sport={video.sport} />
                    {video.status !== "ready" ? <span className="label text-soft">En proceso</span> : null}
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
    </div>
  );
}
