import { NextResponse } from "next/server";
import { requireApiUser, serializeError } from "@/lib/api";
import { ApiServiceError } from "@/lib/services/videoService";
import { getOpsStats, listRecentJobs } from "@/lib/ops/service";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    if (user.rol !== "profesor") {
      throw new ApiServiceError(403, "Solo los profesores pueden ver las operaciones.");
    }
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 100);
    const [jobs, stats] = await Promise.all([listRecentJobs(limit), getOpsStats()]);
    return NextResponse.json({ jobs, stats });
  } catch (error) {
    return serializeError(error);
  }
}