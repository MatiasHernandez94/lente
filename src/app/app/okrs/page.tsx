import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Target, Sparkles, Layers } from "lucide-react";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { ImpactTag, SportTag } from "@/components/ui/Tag";
import { OkrCard } from "@/components/analysis/OkrCard";
import { getSessionUser } from "@/lib/session";
import { listUserVideos } from "@/lib/services/videoService";
import { getAnalysisForVideo } from "@/lib/repo";
import { aggregateAnalyses, collectOkrs } from "@/lib/aggregate";
import { SPORT_LABEL } from "@/lib/sports";

export const metadata: Metadata = { title: "OKRs" };

export default async function OkrsPage() {
  const user = await getSessionUser();
  const videos = user ? await listUserVideos(user.id) : [];
  const ready = videos.filter((video) => video.status === "ready");

  const analysisBundles = await Promise.all(
    ready.map(async (video) => {
      const analysis = await getAnalysisForVideo(video.id);
      return analysis
        ? [
            {
              videoId: video.id,
              videoTitle: video.title,
              sport: video.sport,
              score: analysis.score,
              result: analysis.result,
            },
          ]
        : [];
    }),
  );
  const bundles = analysisBundles.flat();

  const aggregated = aggregateAnalyses(bundles);
  const topOkrs = collectOkrs(bundles).slice(0, 6);
  const topHighlights = aggregated.highlights.slice(0, 6);

  return (
    <div className="space-y-10">
      <header>
        <p className="label mb-2 text-muted">Objetivos y resultados clave</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">OKRs</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Síntesis de los análisis listos: puntajes por deporte, cumplimiento de objetivos y los momentos más
          relevantes del material registrado.
        </p>
      </header>

      {bundles.length === 0 ? (
        <section className="border border-hairline bg-surface px-6 py-16 text-center">
          <h2 className="text-lg font-medium text-ink">Aún no hay OKRs que consolidar</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
            Cuando complete el análisis de al menos un video, los indicadores se consolidarán en esta vista.
          </p>
          <Link
            href="/app/nuevo"
            className="mt-6 inline-flex items-center gap-2 bg-ink px-5 py-2.5 text-sm font-medium text-canvas transition-colors hover:bg-muted"
          >
            Nuevo análisis <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
          </Link>
        </section>
      ) : (
        <>
          <section className="grid gap-px border border-hairline bg-hairline lg:grid-cols-[auto_1fr]">
            <div className="flex items-center gap-5 bg-canvas px-6 py-6">
              <ScoreRing score={aggregated.overallAverage} />
              <div>
                <span className="label text-muted">Promedio general</span>
                <p className="mt-1 text-sm leading-6 text-muted">
                  Sobre {aggregated.totalAnalyses} análisis
                  {aggregated.totalAnalyses === 1 ? "" : "s"} completados.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-px bg-hairline sm:grid-cols-4">
              {aggregated.sports.map((sport) => (
                <div key={sport.sport} className="bg-canvas px-5 py-5">
                  <span className="label text-muted">{SPORT_LABEL[sport.sport]}</span>
                  <p className="table-num mt-1.5 text-2xl font-semibold tracking-tight text-ink">
                    {sport.averageScore}
                  </p>
                  <p className="mt-0.5 text-[11px] text-soft">
                    {sport.analyses} análisis · mejor {sport.bestScore}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-4 flex items-center gap-2 text-base font-medium text-ink">
              <Target size={17} strokeWidth={1.8} aria-hidden="true" /> Objetivos con mayor cumplimiento
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {topOkrs.map(({ videoId, videoTitle, okr }) => (
                <div key={`${videoId}-${okr.objective}`} className="flex flex-col gap-3">
                  <OkrCard okr={okr} />
                  <Link
                    href={`/app/videos/${videoId}`}
                    className="label inline-flex items-center gap-1 text-muted transition-colors hover:text-ink"
                  >
                    <ArrowRight size={12} strokeWidth={2} aria-hidden="true" /> {videoTitle}
                  </Link>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-4 flex items-center gap-2 text-base font-medium text-ink">
              <Sparkles size={17} strokeWidth={1.8} aria-hidden="true" /> Expectativas destacadas
            </h2>
            <div className="border border-hairline">
              <ol>
                {topHighlights.map(({ highlight, videoTitle, sport }, index) => (
                  <li key={`${videoTitle}-${index}`} className="border-b border-hairline px-5 py-4 last:border-b-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="flex items-center gap-1.5 text-muted">
                        <Layers size={13} strokeWidth={1.8} aria-hidden="true" />
                        <span className="text-[11px] tracking-wide">{videoTitle}</span>
                      </span>
                      <SportTag sport={sport} />
                      <span className="table-num text-xs text-soft">{highlight.minute}</span>
                      <ImpactTag impact={highlight.impact} />
                    </div>
                    <h3 className="mt-1.5 text-[15px] font-medium text-ink">{highlight.title}</h3>
                    <p className="mt-0.5 line-clamp-2 text-sm leading-6 text-muted">{highlight.detail}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </>
      )}
    </div>
  );
}