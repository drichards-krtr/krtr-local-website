import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function getNextStartTimeUTC(now = new Date()) {
  // America/Chicago schedule:
  // Mon–Fri: 5:00–23:30
  // Sat–Sun: 7:00–23:30
  // We'll compute next "start" in Chicago time by using Intl without extra libs.

  const tz = "America/Chicago";

  const parts = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      weekday: "short",
    })
      .formatToParts(d)
      .reduce<Record<string, string>>((acc, p) => {
        if (p.type !== "literal") acc[p.type] = p.value;
        return acc;
      }, {});

  const p = parts(now);
  const weekday = p.weekday; // Mon, Tue, ...
  const y = Number(p.year);
  const m = Number(p.month);
  const day = Number(p.day);

  const isWeekend = weekday === "Sat" || weekday === "Sun";
  const startHour = isWeekend ? 7 : 5;

  // Build a Date representing "today at startHour" in Chicago, then convert to UTC ISO.
  // Trick: create a UTC date from Chicago components by asking Intl for the equivalent UTC offset via a constructed string.
  const startLocalString = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(
    startHour
  ).padStart(2, "0")}:00:00`;

  // Convert Chicago local wall-clock to a real UTC instant:
  // We do this by formatting that wall-clock as if it were in Chicago, then re-parsing as UTC via Date constructor
  // using the timeZoneName offset approach is messy; simplest: just advance day-by-day until "now < nextStart".
  // So: compute next start by iterating days.

  const nowMs = now.getTime();

  for (let addDays = 0; addDays < 8; addDays++) {
    const candidate = new Date(nowMs + addDays * 24 * 60 * 60 * 1000);
    const cp = parts(candidate);
    const cWeekday = cp.weekday;
    const cY = Number(cp.year);
    const cM = Number(cp.month);
    const cD = Number(cp.day);
    const cIsWeekend = cWeekday === "Sat" || cWeekday === "Sun";
    const cStartHour = cIsWeekend ? 7 : 5;

    // Build a Date at the Chicago start time by taking the UTC time that corresponds to that Chicago wall-clock.
    // We'll approximate by creating a Date from the Chicago wall-clock string *as if it's UTC* and then adjust by the offset difference:
    // Better: use Intl to get the UTC timestamp of that wall-clock by formatting a known UTC and comparing.
    const wallClock = `${cY}-${String(cM).padStart(2, "0")}-${String(cD).padStart(2, "0")}T${String(
      cStartHour
    ).padStart(2, "0")}:00:00`;

    // Start with a naive UTC date:
    const naiveUTC = new Date(wallClock + "Z");

    // Get what time that naiveUTC is in Chicago:
    const naiveInChicago = parts(naiveUTC);
    const naiveChicagoHour = Number(naiveInChicago.hour);
    const naiveChicagoMinute = Number(naiveInChicago.minute);

    // We *wanted* Chicago hour == cStartHour, minute == 0.
    // Compute delta minutes and correct.
    const deltaMinutes = (naiveChicagoHour - cStartHour) * 60 + naiveChicagoMinute - 0;
    const correctedUTC = new Date(naiveUTC.getTime() - deltaMinutes * 60 * 1000);

    if (addDays === 0) {
      // If today, only accept if it's in the future
      if (correctedUTC.getTime() > nowMs) return correctedUTC.toISOString();
    } else {
      return correctedUTC.toISOString();
    }
  }

  // Fallback: tomorrow 5am-ish
  return new Date(nowMs + 24 * 60 * 60 * 1000).toISOString();
}

export async function GET() {
  const { data, error } = await supabaseServer
    .from("stream_config")
    .select("is_live, stream_id, hls_url, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { status: "offline", nextStartTimeUTC: getNextStartTimeUTC(), error: "db_error" },
      { status: 200 }
    );
  }

  if (data?.is_live && data.hls_url) {
    return NextResponse.json(
      { status: "live", streamUrl: data.hls_url, streamId: data.stream_id ?? null },
      { status: 200 }
    );
  }

  return NextResponse.json(
    { status: "offline", nextStartTimeUTC: getNextStartTimeUTC() },
    { status: 200 }
  );
}
