import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crosshair } from "lucide-react";
import { AnalysisDetail } from "@/components/analysis/AnalysisDetail";
import { getAnalysisForVideo, getVideoById } from "@/lib/repo";
import { getSessionUser } from "@/lib/session";
import { PLAYER_LABEL, formatShortDate } from "@/lib/format";

interface DetailPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: "Análisis" };

export default async function VideoDetailPage({ params }: DetailPageProps) {
  const user = await getSessionUser();
  const { id } = await params;

  const video = await getVideoById(id);
  if (!video || user === null || video.userId !== user.id) {
    notFound();
  }

  const analysis = await getAnalysisForVideo(video.id);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label mb-2 text-muted">Análisis de video</p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{video.title}</h1>
          <p className="mt-2 text-sm text-muted">
            {PLAYER_LABEL[video.sport]} · {formatShortDate(video.createdAt)}
            {analysis ? ` · Procesado el ${formatShortDate(analysis.generatedAt)}` : ""}
          </p>
        </div>
        {(video.sourceType === "upload" || video.sourceType === "camera") && video.sourceRef ? (
          <Link
            href={`/app/videos/${video.id}/escout`}
            className="inline-flex items-center gap-2 border border-ink/20 px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:border-ink hover:bg-surface"
          >
            <Crosshair size={15} strokeWidth={1.8} aria-hidden="true" />
            <span className="hidden sm:inline">Seguimiento de jugadores</span>
            <span className="sm:hidden">Seguimiento</span>
          </Link>
        ) : null}
      </header>

      {analysis ? (
        <AnalysisDetail video={video} analysis={analysis} />
      ) : (
        <div className="border border-hairline bg-surface px-6 py-10 text-center">
          <p className="text-sm text-muted">
            Este video aún no fue analizado. Inicie el análisis desde el listado de videos.
          </p>
        </div>
      )}
    </div>
  );
}