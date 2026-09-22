import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVideoById } from "@/lib/repo";
import { getSessionUser } from "@/lib/session";
import { SPORT_LABEL } from "@/lib/sports";
import { SportsAnalysisViewerFull } from "@/components/sports/SportsAnalysisViewerFull";

interface SportsPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: "Análisis Deportivo" };

export default async function SportsAnalysisPage({ params }: SportsPageProps) {
  const user = await getSessionUser();
  const { id } = await params;

  const video = await getVideoById(id);
  if (!video || user === null || video.userId !== user.id) {
    notFound();
  }

  // Build video URL
  const videoUrl = video.sourceType === "upload" && video.sourceRef
    ? `/api/media/${encodeURIComponent(video.sourceRef)}`
    : video.sourceRef || "";

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="label mb-1 text-muted">Análisis deportivo completo</p>
          <h1 className="text-xl font-semibold tracking-tight text-ink">{video.title}</h1>
          <p className="mt-1 text-xs text-muted">
            {SPORT_LABEL[video.sport] ?? video.sport} · YOLOv8 + OpenCV
          </p>
        </div>
      </header>

      <SportsAnalysisViewerFull videoId={video.id} videoUrl={videoUrl} sport={video.sport} />
    </div>
  );
}
