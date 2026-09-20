import { NextResponse } from "next/server";
import { syncDailyVideoState } from "@/lib/mux";
import { createServerSupabase } from "@/lib/supabase/server";
import { assertLegacyEditorialWrites } from "@/lib/legacyEditorialWrite";
import { resolveDistrictFromHost } from "@/lib/districts";

export async function POST(request: Request) {
  const { dailyId } = await request.json().catch(() => ({}));
  if (!dailyId) {
    return NextResponse.json({ error: "Missing dailyId" }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try { await assertLegacyEditorialWrites(); }
  catch { return NextResponse.json({ error: "Legacy editorial writes are disabled." }, { status: 403 }); }
  try {
    const district = resolveDistrictFromHost(request.headers.get("x-forwarded-host") || request.headers.get("host"));
    const { data: target, error } = await supabase.from("dailys").select("id").eq("id", dailyId).eq("district_key", district).is("nrcs_edition_id", null).maybeSingle();
    if (error || !target) return NextResponse.json({ error: "Legacy Daily not found in this district." }, { status: 404 });
    const daily = await syncDailyVideoState(dailyId);
    if (!daily) {
      return NextResponse.json({ error: "Daily not found" }, { status: 404 });
    }

    return NextResponse.json({
      mux_asset_id: daily.mux_asset_id,
      mux_upload_id: daily.mux_upload_id,
      mux_playback_id: daily.mux_playback_id,
      mux_status: daily.mux_status || "none",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sync Daily video.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
