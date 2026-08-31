import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { VideosTable } from "@/components/app/VideosTable";
import { DemoExamplesButton } from "@/components/app/DemoExamplesButton";
import { getSessionUser } from "@/lib/session";
import { listUserVideos } from "@/lib/services/videoService";

export const metadata: Metadata = { title: "Videos" };

export default async function VideosPage() {
  const user = await getSessionUser();
  const videos = user ? await listUserVideos(user.id) : [];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label mb-2 text-muted">Acervo de material</p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Videos</h1>
          <p className="mt-2 text-sm text-muted">
            {videos.length === 0
              ? "Aún no registró material para analizar."
              : `${videos.length} registro${videos.length === 1 ? "" : "s"} de video.`}
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

      {videos.length === 0 ? (
        <div className="border border-hairline bg-surface px-6 py-16 text-center">
          <p className="mx-auto max-w-md text-sm leading-6 text-muted">
            Comience registrando su primer video o cargue ejemplos de demostración para explorar la interfaz.
          </p>
        </div>
      ) : (
        <VideosTable videos={videos} />
      )}
    </div>
  );
}