import type { Metadata } from "next";
import { notFound } from "next/navigation";
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

  const video = getVideoById(id);
  if (!video || user === null || video.userId !== user.id) {
    notFound();
  }

  const analysis = getAnalysisForVideo(video.id);

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