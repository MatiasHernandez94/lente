import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applyPendingTutorLink } from "@/lib/profile/service";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/app";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) {
        await applyPendingTutorLink(user.id);
      }
      const safeNext = next.startsWith("/") ? next : "/app";
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
