import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { syncStoryVideoState } from "@/lib/mux";
import { assertLegacyEditorialWrites } from "@/lib/legacyEditorialWrite";
import { resolveDistrictFromHost } from "@/lib/districts";

export async function POST(request: Request) {
  const { storyId } = await request.json().catch(() => ({}));
  if (!storyId) {
    return NextResponse.json({ error: "Missing storyId" }, { status: 400 });
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
    const { data: target, error } = await supabase.from("stories").select("id").eq("id", storyId).eq("district_key", district).eq("editorial_origin", "cms").maybeSingle();
    if (error || !target) return NextResponse.json({ error: "Legacy Story not found in this district." }, { status: 404 });
    const story = await syncStoryVideoState(storyId);
    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    return NextResponse.json({
      mux_asset_id: story.mux_asset_id,
      mux_upload_id: story.mux_upload_id,
      mux_playback_id: story.mux_playback_id,
      mux_status: story.mux_status || "none",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sync story video.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
