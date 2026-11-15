import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { authorizeNrcsService } from "@/lib/nrcsPublication";
import { invalidateArticleDistrict } from "@/lib/articleCache";
import { parseDistrictKey } from "@/lib/districts";

// Authenticated recovery endpoint; also used by the legacy browser editor after
// its Supabase write. Never trust a CMS cookie without checking the actual user.
export async function POST(request: Request) {
  if (!authorizeNrcsService(request)) {
    const db = await createServerSupabase();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: profile } = await db.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const district = parseDistrictKey(body?.district);
  if (!district) return NextResponse.json({ error: "Invalid district" }, { status: 400 });
  invalidateArticleDistrict(district);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
