import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScoutViewer } from "@/components/scout/ScoutViewer";
import { getVideoById } from "@/lib/repo";
import {
  getScoutCalibration,
  getScoutData,
  getScoutStatus,
  listScoutAssignments,
  scoutPlayerMetrics,
} from "@/lib/scout/service";
import type { ScoutSnapshot } from "@/lib/scout/types";
import { getSessionUser } from "@/lib/session";
import { formatShortDate } from "@/lib/format";

interface ScoutPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: "Seguimiento de jugadores" };

export default async function ScoutPage({ params }: ScoutPageProps) {
  const user = await getSessionUser();
  const { id } = await params;

  const video = await getVideoById(id);
  if (!video || user === null || video.userId !== user.id) {
    notFound();
  }

  const snapshot: ScoutSnapshot = {
    status: await getScoutStatus(video),
    data: await getScoutData(video),
    assignments: await listScoutAssignments(video),
    calibration: await getScoutCalibration(video),
    metrics: await scoutPlayerMetrics(video),
  };

  return (
    <div className="space-y-8">
      <header>
        <p className="label mb-2 text-muted">Seguimiento de jugadores</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{video.title}</h1>
        <p className="mt-2 text-sm text-muted">Creado el {formatShortDate(video.createdAt)}</p>
      </header>

      <ScoutViewer video={video} initial={snapshot} />
    </div>
  );
}