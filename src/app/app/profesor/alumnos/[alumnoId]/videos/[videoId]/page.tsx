import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getVideoById, getUserById, getAnalysisForVideo } from "@/lib/repo";
import { isAlumnoOf } from "@/lib/profile/service";
import { listCorreccionesByVideo } from "@/lib/correccion/service";
import { PLAYER_LABEL, formatShortDate } from "@/lib/format";
import { VideoInsights } from "@/components/app/VideoInsights";
import { CorrectionForm } from "@/components/app/CorrectionForm";
import { CorreccionesList } from "@/components/app/CorreccionesList";

interface CorreccionVideoPageProps {
  params: Promise<{ alumnoId: string; videoId: string }>;
  searchParams?: Promise<{ t?: string }>;
}

export const metadata: Metadata = { title: "Corregir video" };

export default async function CorreccionVideoPage({ params, searchParams }: CorreccionVideoPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.rol !== "profesor") redirect("/app");

  const { alumnoId, videoId } = await params;
  const { t } = (await searchParams) ?? {};
  const initialSeconds = parseInt(t ?? "", 10);
  const hasClip = Number.isFinite(initialSeconds) && initialSeconds > 0;

  const [linked, video, alumno] = await Promise.all([
    isAlumnoOf(user.id, alumnoId),
    getVideoById(videoId),
    getUserById(alumnoId),
  ]);
  if (!linked || !video || video.userId !== alumnoId) notFound();

  const [correcciones, analysis] = await Promise.all([
    listCorreccionesByVideo(videoId),
    getAnalysisForVideo(videoId),
  ]);

  const videoUrl =
    video.sourceType === "youtube"
      ? ""
      : video.sourceRef
        ? `/api/media/${encodeURIComponent(video.sourceRef)}`
        : "";

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/app/videos/${video.id}`;

  return (
    <div className="space-y-8">
      <header>
        <p className="label mb-2 text-muted">
          <Link href="/app/profesor" className="text-muted underline underline-offset-4 hover:text-ink">
            Mis alumnos
          </Link>{" "}
          / Corrección
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{video.title}</h1>
        <p className="mt-1.5 text-sm text-muted">
          {PLAYER_LABEL[video.sport]} de {alumno?.name ?? "alumna/o"} · {formatShortDate(video.createdAt)}
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          {videoUrl || video.sourceType === "youtube" ? (
            <VideoInsights
              videoId={video.id}
              videoTitle={video.title}
              videoUrl={videoUrl}
              sourceType={video.sourceType}
              sourceRef={video.sourceRef}
              sport={video.sport}
              initialSeconds={hasClip ? initialSeconds : undefined}
            />
          ) : (
            <p className="text-sm text-muted">El análisis deportivo requiere un video local.</p>
          )}

          <section className="border border-hairline bg-surface p-5">
            <h2 className="text-base font-medium text-ink">Nueva corrección</h2>
            <p className="mt-1 text-sm text-muted">
              Agregá una observación, opcionalmente con el minuto del video donde aplica.
            </p>
            <div className="mt-4">
              <CorrectionForm videoId={video.id} alumnoId={alumnoId} />
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <h2 className="text-base font-medium text-ink">Correcciones enviadas</h2>
          {correcciones.length === 0 ? (
            <div className="border border-hairline bg-surface px-5 py-8 text-center">
              <p className="text-sm text-muted">Aún no hay correcciones para este video.</p>
            </div>
          ) : (
            <CorreccionesList
              correcciones={correcciones}
              shareUrl={shareUrl}
              alumnoName={alumno?.name}
              clipHrefPrefix={`/app/profesor/alumnos/${alumnoId}/videos`}
              puntaje={analysis?.score ?? null}
            />
          )}
        </aside>
      </div>
    </div>
  );
}