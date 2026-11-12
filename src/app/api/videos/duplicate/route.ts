import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { getClient } from "@/lib/db";
import { readJsonBody } from "@/lib/validation/api";

const duplicateSchema = z.object({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/) });

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    const { fingerprint } = await readJsonBody(request, duplicateSchema);
    const { data, error } = await getClient()
      .from("videos")
      .select("id, title, sport, created_at")
      .eq("user_id", user.id)
      .eq("fingerprint_v1", fingerprint)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`duplicate video lookup: ${error.message}`);
    return NextResponse.json({ video: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serializeError(error);
  }
}
