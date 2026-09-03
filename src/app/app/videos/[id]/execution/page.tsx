import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExecutionViewer } from "@/components/execution/ExecutionViewer";
import { getVideoById } from "@/lib/repo";
import { getExecutionSnapshot } from "@/lib/execution/service";
import type { ExecutionSnapshot } from "@/lib/execution/types";
import { getSessionUser } from "@/lib/session";
import { formatShortDate } from "@/lib/format";

interface ExecutionPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: "Ejecución de ejercicio" };

export default async function ExecutionPage({ params }: ExecutionPageProps) {
  const user = await getSessionUser();
  const { id } = await params;

  const video = await getVideoById(id);
  if (!video || user === null || video.userId !== user.id) {
    notFound();
  }

  const snapshot: ExecutionSnapshot = await getExecutionSnapshot(video);

  return (
    <div className="space-y-8">
      <header>
        <p className="label mb-2 text-muted">Ejecución de ejercicio</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{video.title}</h1>
        <p className="mt-2 text-sm text-muted">Creado el {formatShortDate(video.createdAt)}</p>
      </header>

      <ExecutionViewer video={video} initial={snapshot} />
    </div>
  );
}
