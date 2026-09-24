import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, BarChart3, Crosshair } from "lucide-react";
import { getVideoById, getAnalysisForVideo } from "@/lib/repo";
import { getSessionUser } from "@/lib/session";
import { listCorreccionesByVideo } from "@/lib/correccion/service";
import { PLAYER_LABEL, formatShortDate } from "@/lib/format";
import { VideoInsights } from "@/components/app/VideoInsights";
import { SaveAnalysisPrompt } from "@/components/app/SaveAnalysisPrompt";
import { CorreccionesList } from "@/components/app/CorreccionesList";

interface DetailPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ t?: string }>;
}

export const metadata: Metadata = { title: "Análisis" };

export default async function VideoDetailPage({ params, searchParams }: DetailPageProps) {
  const user = await getSessionUser();
  const { id } = await params;
  const { t } = (await searchParams) ?? {};
  const initialSeconds = parseInt(t ?? "", 10);
  const hasClip = Number.isFinite(initialSeconds) && initialSeconds > 0;

  const video = await getVideoById(id);
  if (!video || user === null || video.userId !== user.id) {
    notFound();
  }

  const [correcciones, analysis] = await Promise.all([
    listCorreccionesByVideo(id),
    getAnalysisForVideo(id),
  ]);
  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/app/videos/${video.id}`;

  const videoUrl =
    video.sourceType === "youtube"
      ? ""
      : video.sourceRef
        ? `/api/media/${encodeURIComponent(video.sourceRef)}`
        : "";

  return (
    <div className="space-y-6">
      {/* Save prompt for auto-generated videos */}
      <SaveAnalysisPrompt
        videoId={video.id}
        initialTitle={video.title}
        initialSport={video.sport}
      />

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{video.title}</h1>
          <p className="mt-1.5 text-sm text-muted">
            {PLAYER_LABEL[video.sport]} · {formatShortDate(video.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {video.sourceRef && video.sourceType !== "youtube" && (
            <>
              <Link
                href={`/app/videos/${video.id}/escout`}
                className="inline-flex items-center gap-1.5 border border-ink/20 px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-ink hover:bg-surface"
              >
                <Crosshair size={13} /> Seguimiento
              </Link>
              <Link
                href={`/app/videos/${video.id}/execution`}
                className="inline-flex items-center gap-1.5 border border-ink/20 px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-ink hover:bg-surface"
              >
                <Activity size={13} /> Ejecución
              </Link>
              <Link
                href={`/app/videos/${video.id}/sports`}
                className="inline-flex items-center gap-1.5 border border-ink/20 px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-ink hover:bg-surface"
              >
                <BarChart3 size={13} /> Deportivo
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Unified analysis view */}
      {videoUrl ? (
        <VideoInsights
          videoId={video.id}
          videoTitle={video.title}
          videoUrl={videoUrl}
          sport={video.sport}
          initialSeconds={hasClip ? initialSeconds : undefined}
        />
      ) : (
        <div className="border border-hairline bg-surface px-6 py-10 text-center">
          <p className="text-sm text-muted">
            Video de YouTube — el análisis deportivo requiere un archivo de video local.
          </p>
        </div>
      )}

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-medium text-ink">Correcciones de tus profesores</h2>
          {hasClip ? (
            <p className="text-[12px] text-muted">Video abierto en el minuto indicado por la corrección.</p>
          ) : null}
        </div>
        {correcciones.length === 0 ? (
          <div className="border border-hairline bg-surface px-6 py-10 text-center">
            <p className="text-sm text-muted">Tus profesores aún no dejaron correcciones en este video.</p>
          </div>
        ) : (
          <CorreccionesList correcciones={correcciones} shareUrl={shareUrl} puntaje={analysis?.score ?? null} />
        )}
      </section>
    </div>
  );
}
