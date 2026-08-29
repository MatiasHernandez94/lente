import type { AnalysisResult, Highlight, Impact, Okr, Sport } from "./analysis/types";

export interface SportSummary {
  sport: Sport;
  label: string;
  analyses: number;
  averageScore: number;
  bestScore: number;
}

export interface AggregatedView {
  sports: SportSummary[];
  overallAverage: number;
  totalAnalyses: number;
  highlights: { highlight: Highlight; videoTitle: string; sport: Sport }[];
}

const IMPACT_WEIGHT: Record<Impact, number> = { alta: 0, media: 1, baja: 2 };

export interface VideoAnalysisBundle {
  videoId: string;
  videoTitle: string;
  sport: Sport;
  score: number;
  result: AnalysisResult;
}

export function aggregateAnalyses(bundles: VideoAnalysisBundle[]): AggregatedView {
  const bySport = new Map<Sport, { total: number; sum: number; best: number }>();

  for (const bundle of bundles) {
    const current = bySport.get(bundle.sport) ?? { total: 0, sum: 0, best: 0 };
    bySport.set(bundle.sport, {
      total: current.total + 1,
      sum: current.sum + bundle.score,
      best: Math.max(current.best, bundle.score),
    });
  }

  const sports: SportSummary[] = [...bySport.entries()]
    .map(([sport, stats]) => ({
      sport,
      label: sport,
      analyses: stats.total,
      averageScore: Math.round(stats.sum / stats.total),
      bestScore: stats.best,
    }))
    .sort((a, b) => b.averageScore - a.averageScore);

  const highlights = bundles
    .flatMap((bundle) =>
      bundle.result.highlights.map((highlight) => ({
        highlight,
        videoTitle: bundle.videoTitle,
        sport: bundle.sport,
      })),
    )
    .sort((a, b) => {
      const byImpact = IMPACT_WEIGHT[a.highlight.impact] - IMPACT_WEIGHT[b.highlight.impact];
      if (byImpact !== 0) return byImpact;
      return b.highlight.minute.localeCompare(a.highlight.minute);
    });

  const overallAverage = bundles.length
    ? Math.round(bundles.reduce((acc, bundle) => acc + bundle.score, 0) / bundles.length)
    : 0;

  return { sports, overallAverage, totalAnalyses: bundles.length, highlights };
}

export interface OkrBundle {
  videoId: string;
  videoTitle: string;
  sport: Sport;
  okr: Okr;
}

export function collectOkrs(bundles: VideoAnalysisBundle[]): OkrBundle[] {
  return bundles
    .flatMap((bundle) =>
      bundle.result.okrs.map((okr) => ({
        videoId: bundle.videoId,
        videoTitle: bundle.videoTitle,
        sport: bundle.sport,
        okr,
      })),
    )
    .sort((a, b) => b.okr.progress - a.okr.progress);
}