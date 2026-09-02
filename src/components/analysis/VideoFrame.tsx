import type { SourceType } from "@/lib/analysis/types";

export function youtubeEmbedUrl(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/))([A-Za-z0-9_-]{11})|youtu\.be\/([A-Za-z0-9_-]{11})/,
  );
  const id = match?.[1] ?? match?.[2] ?? null;
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

interface VideoFrameProps {
  sourceType: SourceType;
  sourceRef: string | null;
  title: string;
}

export function VideoFrame({ sourceType, sourceRef, title }: VideoFrameProps) {
  if (sourceType === "youtube" && sourceRef) {
    const embed = youtubeEmbedUrl(sourceRef);
    if (embed) {
      return (
        <div className="aspect-video w-full bg-ink">
          <iframe
            src={embed}
            title={`Video fuente: ${title}`}
            className="h-full w-full"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      );
    }
  }

  if ((sourceType === "upload" || sourceType === "camera") && sourceRef) {
    return (
      <div className="aspect-video w-full bg-ink">
        <video src={`/api/media/${encodeURIComponent(sourceRef)}`} controls preload="metadata" className="h-full w-full">
          <p className="p-4 text-sm text-white">Su navegador no puede reproducir este video.</p>
        </video>
      </div>
    );
  }

  return (
    <div className="flex aspect-video w-full items-center justify-center bg-surface">
      <p className="label text-muted">Fuente de video pendiente de enlace</p>
    </div>
  );
}