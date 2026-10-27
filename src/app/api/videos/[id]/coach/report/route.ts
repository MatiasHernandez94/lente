import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { getVideoById } from "@/lib/repo";
import { getSportAnalysis } from "@/lib/sports/service";
import {
  AIActionError,
  CoachReportVisionResult,
  generateCoachReportWithVision,
  getVideoAIInsight,
  runMotorAudit,
  saveVideoAIInsight,
} from "@/lib/ai/video-agent";
import type { AuditVerdict } from "@/lib/ai/providers/types";
import { ApiServiceError } from "@/lib/services/videoService";
import { getActiveProcessingJob, getLatestProcessingJob, isProcessorQueueEnabled, enqueueProcessingJob } from "@/lib/processor";
import { resolveJobViewStatus, jobErrorMessage } from "@/lib/processor-status";

export interface CoachReportApiResponse extends CoachReportVisionResult {
  cached: boolean;
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/coach/report">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    const { id } = await ctx.params;

    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no le corresponde.");
    }

    if (isProcessorQueueEnabled()) {
      const { job } = await enqueueProcessingJob(id, "coach-report");
      return NextResponse.json({ status: "queued", jobId: job.id });
    }

    const analysis = await getSportAnalysis(id);

    // Mismo flujo de dos pasadas que el worker: auditar, clasificar y elegir la
    // corrección crítica antes de redactar el informe. Si la pasada 1 falla, el
    // informe se genera igual razonando desde las métricas.
    let verdict: AuditVerdict | null = null;
    try {
      verdict = await runMotorAudit(video, (analysis ?? null) as Record<string, unknown> | null);
      await saveVideoAIInsight(video.id, "motor_audit", {
        ...verdict,
        at: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`[coach/report] auditoría falló para ${id}:`, error instanceof Error ? error.message : error);
    }

    const result = await generateCoachReportWithVision(
      video,
      (analysis ?? null) as Record<string, unknown> | null,
      verdict,
    );
    await saveVideoAIInsight(video.id, "coach_report", { ...result, at: new Date().toISOString() });

    const body: CoachReportApiResponse = { ...result, cached: false };
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof AIActionError) {
      return NextResponse.json(
        { error: error.message, kind: error.kind, detail: error.detail ?? null },
        { status: 200 },
      );
    }
    return serializeError(error);
  }
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/coach/report">): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;

    const video = await getVideoById(id);
    if (!video || video.userId !== user.id) {
      throw new ApiServiceError(404, "El video no existe o no le corresponde.");
    }

    const activeJob = await getActiveProcessingJob(id, "coach-report").catch(() => null);
    const stored = await getVideoAIInsight(id);
    const report = stored?.coach_report;
    if (report) {
      const body: CoachReportApiResponse = {
        summary: String(report.summary ?? ""),
        positives: sanitizePoints(report.positives),
        improvements: sanitizePoints(report.improvements),
        plan: sanitizeDrills(report.plan),
        provider: String(report.provider ?? ""),
        cached: true,
      };
      return NextResponse.json(body);
    }

    const latestJob = activeJob ? null : await getLatestProcessingJob(id, "coach-report").catch(() => null);
    const view = resolveJobViewStatus(activeJob, latestJob);
    if (view === "queued") {
      return NextResponse.json({ status: "queued", jobId: activeJob?.id });
    }

    if (view === "error") {
      const jobError = (latestJob?.error ?? {}) as { kind?: unknown; detail?: unknown };
      return NextResponse.json({
        status: "error",
        error: jobErrorMessage(latestJob?.error, "La generación del informe falló."),
        kind: String(jobError.kind ?? "error"),
        detail: jobError.detail ? String(jobError.detail) : null,
      });
    }

    return NextResponse.json({ status: "none" });
  } catch (error) {
    return serializeError(error);
  }
}

function sanitizePoints(raw: unknown): Array<{ title: string; detail: string; time_s: number | null }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      title: String(item.title ?? ""),
      detail: String(item.detail ?? ""),
      time_s: Number.isFinite(item.time_s) ? Number(item.time_s) : null,
    }))
    .filter((point) => point.title && point.detail)
    .slice(0, 5);
}

function sanitizeDrills(raw: unknown): Array<{ title: string; detail: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      title: String(item.title ?? "").trim(),
      detail: String(item.detail ?? "").trim(),
    }))
    .filter((drill) => drill.title && drill.detail)
    .slice(0, 3);
}