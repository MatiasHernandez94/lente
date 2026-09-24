import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { listVideosByUser } from "@/lib/repo";
import { getSessionUser } from "@/lib/session";
import { isAlumnoOf } from "@/lib/profile/service";
import { formatShortDate } from "@/lib/format";
import { SportTag } from "@/components/ui/Tag";

interface AlumnoVideosPageProps {
  params: Promise<{ alumnoId: string }>;
}

export const metadata: Metadata = { title: "Videos del alumno" };

export default async function AlumnoVideosPage({ params }: AlumnoVideosPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.rol !== "profesor") redirect("/app");

  const { alumnoId } = await params;
  const linked = await isAlumnoOf(user.id, alumnoId);
  if (!linked) notFound();

  const videos = await listVideosByUser(alumnoId);

  return (
    <div className="space-y-8">
      <header>
        <p className="label mb-2 text-muted">
          <Link href="/app/profesor" className="text-muted underline underline-offset-4 hover:text-ink">
            Mis alumnos
          </Link>{" "}
          / Videos
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Videos de la alumna/o</h1>
      </header>

      {videos.length === 0 ? (
        <section className="border border-hairline bg-surface px-6 py-16 text-center">
          <h2 className="text-lg font-medium text-ink">Esta alumna/o aún no registró videos</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
            Cuando suba un análisis aparecerá aquí para que lo revises y corrijas.
          </p>
        </section>
      ) : (
        <div className="grid gap-px border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((video) => (
            <Link
              key={video.id}
              href={`/app/profesor/alumnos/${alumnoId}/videos/${video.id}`}
              className="group flex flex-col justify-between gap-6 bg-canvas px-5 py-5 transition-colors hover:bg-surface"
            >
              <div>
                <SportTag sport={video.sport} />
                <h3 className="mt-3 line-clamp-2 text-[15px] font-medium leading-6 text-ink group-hover:underline">
                  {video.title}
                </h3>
                <p className="mt-1 text-[11px] tracking-wide text-soft">{formatShortDate(video.createdAt)}</p>
              </div>
              <span className="label text-muted">Revisar y corregir</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}