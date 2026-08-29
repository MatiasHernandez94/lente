import Link from "next/link";
import { SquareArrowOutUpRight } from "lucide-react";
import type { ListItem } from "@/lib/services/videoService";
import { AnalyzeButton } from "./AnalyzeButton";
import { SourceTag, SportTag, StatusTag } from "@/components/ui/Tag";
import { formatDateTime, formatDurationSeconds } from "@/lib/format";

interface VideosTableProps {
  videos: ListItem[];
}

export function VideosTable({ videos }: VideosTableProps) {
  if (videos.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto border border-hairline">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead>
          <tr className="border-b border-hairline">
            <th scope="col" className="label px-5 py-3 font-medium text-soft">
              Video
            </th>
            <th scope="col" className="label px-5 py-3 font-medium text-soft">
              Deporte
            </th>
            <th scope="col" className="label px-5 py-3 font-medium text-soft">
              Fuente
            </th>
            <th scope="col" className="label px-5 py-3 font-medium text-soft">
              Duración
            </th>
            <th scope="col" className="label px-5 py-3 font-medium text-soft">
              Estado
            </th>
            <th scope="col" className="label px-5 py-3 text-right font-medium text-soft">
              Puntaje
            </th>
            <th scope="col" className="label px-5 py-3 text-right font-medium text-soft">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody>
          {videos.map((video) => (
            <tr key={video.id} className="group border-b border-hairline transition-colors last:border-b-0 hover:bg-surface/60">
              <td className="max-w-[280px] px-5 py-4">
                <Link href={`/app/videos/${video.id}`} className="block">
                  <span className="block truncate text-sm font-medium text-ink group-hover:underline">
                    {video.title}
                  </span>
                  <span className="block text-[11px] tracking-wide text-soft">{formatDateTime(video.createdAt)}</span>
                </Link>
              </td>
              <td className="px-5 py-4">
                <SportTag sport={video.sport} />
              </td>
              <td className="px-5 py-4">
                <SourceTag source={video.sourceType} />
              </td>
              <td className="table-num px-5 py-4 text-sm text-muted">
                {video.durationSeconds !== null ? formatDurationSeconds(video.durationSeconds) : "—"}
              </td>
              <td className="px-5 py-4">
                <StatusTag status={video.status} />
              </td>
              <td className="table-num px-5 py-4 text-right text-sm font-semibold text-ink">
                {video.analysis ? video.analysis.score : "—"}
              </td>
              <td className="px-5 py-4">
                <div className="flex items-center justify-end gap-2">
                  {video.status === "ready" && video.analysis ? (
                    <Link
                      href={`/app/videos/${video.id}`}
                      className="inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:underline"
                    >
                      <SquareArrowOutUpRight size={14} strokeWidth={1.8} aria-hidden="true" /> Ver
                    </Link>
                  ) : (
                    <AnalyzeButton videoId={video.id} status={video.status} />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}