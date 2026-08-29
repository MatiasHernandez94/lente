import { Sparkles, Target, Gauge, Users } from "lucide-react";
import type { AnalysisRecord, VideoRow } from "@/lib/schema";
import { ScoreRing } from "./ScoreRing";
import { MetricBar } from "./MetricBar";
import { OkrCard } from "./OkrCard";
import { HighlightsTimeline } from "./HighlightsTimeline";
import { VideoFrame } from "./VideoFrame";
import { PlayerCard } from "./PlayerCard";
import { SourceTag, SportTag } from "@/components/ui/Tag";

interface AnalysisDetailProps {
  video: VideoRow;
  analysis: AnalysisRecord;
}

export function AnalysisDetail({ video, analysis }: AnalysisDetailProps) {
  const players = analysis.result.players ?? [];

  return (
    <div className="space-y-10">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
        <section>
          <VideoFrame sourceType={video.sourceType} sourceRef={video.sourceRef} title={video.title} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <SportTag sport={video.sport} />
            <SourceTag source={video.sourceType} />
          </div>
        </section>

        <section className="flex flex-col justify-between gap-6">
          <div className="flex items-center gap-6">
            <ScoreRing score={analysis.score} />
            <div>
              <span className="label text-muted">Calificación general</span>
              <p className="mt-1 text-sm leading-6 text-muted">
                Rendimiento global estimado del material analizado.
              </p>
            </div>
          </div>
          <div>
            <span className="label mb-3 flex items-center gap-1.5 text-muted">
              <Sparkles size={13} strokeWidth={1.8} aria-hidden="true" /> Síntesis
            </span>
            <p className="text-[15px] leading-7 text-ink">{analysis.result.summary}</p>
          </div>
        </section>
      </div>

      <section>
        <h2 className="mb-4 flex items-center gap-2 text-base font-medium text-ink">
          <Gauge size={17} strokeWidth={1.8} aria-hidden="true" /> Indicadores
        </h2>
        <div className="border border-hairline px-5 py-3">
          {analysis.result.metrics.map((metric) => (
            <MetricBar key={metric.key} metric={metric} />
          ))}
        </div>
      </section>

      {players.length > 0 ? (
        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-medium text-ink">
              <Users size={17} strokeWidth={1.8} aria-hidden="true" /> Seguimiento por jugador
            </h2>
            <span className="label text-muted">
              {players.length} {players.length === 1 ? "jugador registrado" : "jugadores registrados"}
            </span>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {players.map((player, index) => (
              <PlayerCard key={`${player.name}-${index}`} player={player} index={index} />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-4 flex items-center gap-2 text-base font-medium text-ink">
          <Target size={17} strokeWidth={1.8} aria-hidden="true" /> OKRs del análisis
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {analysis.result.okrs.map((okr) => (
            <OkrCard key={okr.objective} okr={okr} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 flex items-center gap-2 text-base font-medium text-ink">
          <Sparkles size={17} strokeWidth={1.8} aria-hidden="true" /> Lo más destacado
        </h2>
        <div className="border border-hairline px-5 py-6">
          <HighlightsTimeline highlights={analysis.result.highlights} />
        </div>
      </section>
    </div>
  );
}