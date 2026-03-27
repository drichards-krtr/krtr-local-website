import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { isLiveBySchedule, type StreamScheduleRow } from "@/lib/streamSchedule";
import { resolveDistrictFromHost } from "@/lib/districts";

export async function GET(request: Request) {
  const districtKey = resolveDistrictFromHost(
    request.headers.get("x-forwarded-host") || request.headers.get("host")
  );
  const secret = process.env.STREAM_SYNC_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const supabase = getSupabaseServer();
  const { data: config, error: configError } = await supabase
    .from("stream_config")
    .select("is_live, stream_id, hls_url, mode, timezone, updated_at")
    .eq("district_key", districtKey)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (configError || !config) {
    return NextResponse.json({ ok: false, error: "missing_config" }, { status: 200 });
  }

  const { data: scheduleRows } = await supabase
    .from("stream_schedule")
    .select("id, day_of_week, start_time, end_time, is_active")
    .eq("district_key", districtKey)
    .eq("is_active", true);

  const timezone = config.timezone || "America/Chicago";
  const schedules = (scheduleRows || []) as StreamScheduleRow[];
  const isLiveAuto = isLiveBySchedule(schedules, timezone);
  const mode = config.mode || "manual";

  if (mode === "auto" && config.is_live !== isLiveAuto) {
    await supabase.from("stream_config").insert({
      district_key: districtKey,
      is_live: isLiveAuto,
      stream_id: config.stream_id || null,
      hls_url: config.hls_url || null,
      mode: "auto",
      timezone,
    });
  }

  return NextResponse.json({
    ok: true,
    mode,
    timezone,
    computedLive: isLiveAuto,
  });
}
