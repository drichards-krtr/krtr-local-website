import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import {
  getNextStartTimeUTC,
  isLiveBySchedule,
  type StreamScheduleRow,
} from "@/lib/streamSchedule";

export async function GET() {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("stream_config")
    .select("is_live, stream_id, hls_url, mode, timezone, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const timezone = data?.timezone || "America/Chicago";

  if (error) {
    return NextResponse.json(
      { status: "offline", nextStartTimeUTC: null, error: "db_error" },
      { status: 200 }
    );
  }

  const { data: scheduleRows } = await supabase
    .from("stream_schedule")
    .select("id, day_of_week, start_time, end_time, is_active")
    .eq("is_active", true);

  const schedules = (scheduleRows || []) as StreamScheduleRow[];
  const mode = data?.mode || "manual";
  const isLiveAuto = mode === "auto" ? isLiveBySchedule(schedules, timezone) : false;
  const isLiveEffective = mode === "auto" ? isLiveAuto : !!data?.is_live;

  if (mode === "auto" && data && data.is_live !== isLiveAuto) {
    await supabase.from("stream_config").insert({
      is_live: isLiveAuto,
      stream_id: data.stream_id || null,
      hls_url: data.hls_url || null,
      mode,
      timezone,
    });
  }

  if (isLiveEffective && data?.hls_url) {
    return NextResponse.json(
      { status: "live", streamUrl: data.hls_url, streamId: data.stream_id ?? null },
      { status: 200 }
    );
  }

  const nextStartTimeUTC = getNextStartTimeUTC(schedules, timezone);
  return NextResponse.json(
    { status: "offline", nextStartTimeUTC },
    { status: 200 }
  );
}
