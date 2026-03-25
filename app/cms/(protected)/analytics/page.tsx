import { createServerSupabase } from "@/lib/supabase/server";
import {
  formatDateTimeInTimeZone,
  getDateTextInTimeZone,
  getDayRangeInTimeZone,
} from "@/lib/dates";

type AnalyticsSession = {
  session_id: string;
  device_id: string;
  stream_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
};

function formatDuration(durationSeconds: number | null) {
  if (durationSeconds === null || Number.isNaN(durationSeconds)) {
    return "-";
  }

  const totalSeconds = Math.max(0, Math.floor(durationSeconds));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return formatDateTimeInTimeZone(date);
}

function isDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: { day?: string };
}) {
  const supabase = createServerSupabase();
  const requestedDay = searchParams.day?.trim() || "";
  let selectedDay = isDateInput(requestedDay) ? requestedDay : "";

  if (!selectedDay) {
    const { data: latestRows } = await supabase
      .from("analytics_sessions")
      .select("started_at")
      .order("started_at", { ascending: false })
      .limit(1);

    selectedDay = latestRows?.[0]?.started_at
      ? getDateTextInTimeZone(new Date(latestRows[0].started_at))
      : getDateTextInTimeZone();
  }

  const { startIso, endIso } = getDayRangeInTimeZone(selectedDay);

  const { data, error } = await supabase
    .from("analytics_sessions")
    .select("session_id, device_id, stream_id, started_at, ended_at, duration_seconds")
    .gte("started_at", startIso)
    .lt("started_at", endIso)
    .order("started_at", { ascending: false });

  const sessions: AnalyticsSession[] = data || [];
  const totalSessions = sessions.length;
  const activeSessions = sessions.filter((session) => !session.ended_at).length;
  const completedDurations = sessions
    .map((session) => session.duration_seconds)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const averageDurationSeconds =
    completedDurations.length > 0
      ? Math.floor(
          completedDurations.reduce((sum, value) => sum + value, 0) / completedDurations.length
        )
      : null;

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Analytics Sessions</h1>
        <p className="text-sm text-neutral-500">
          Displaying one Chicago calendar day at a time.
        </p>
      </header>

      <form className="flex flex-wrap items-end gap-3 rounded border border-neutral-200 bg-white p-4">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-semibold uppercase text-neutral-500">Day</span>
          <input
            type="date"
            name="day"
            defaultValue={selectedDay}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
        >
          Show day
        </button>
        <a
          href="/cms/analytics"
          className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700"
        >
          Clear
        </a>
      </form>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded border border-neutral-200 bg-white p-4">
          <p className="text-sm text-neutral-500">Total Sessions</p>
          <p className="text-2xl font-semibold">{totalSessions}</p>
        </div>
        <div className="rounded border border-neutral-200 bg-white p-4">
          <p className="text-sm text-neutral-500">Average Duration</p>
          <p className="text-2xl font-semibold font-mono">
            {formatDuration(averageDurationSeconds)}
          </p>
        </div>
        <div className="rounded border border-neutral-200 bg-white p-4">
          <p className="text-sm text-neutral-500">Active Sessions</p>
          <p className="text-2xl font-semibold">{activeSessions}</p>
        </div>
      </section>

      {error ? (
        <section className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load analytics sessions.
        </section>
      ) : null}

      <section className="overflow-x-auto rounded border border-neutral-200 bg-white">
        <div className="grid min-w-[1100px] grid-cols-[2fr_2fr_1fr_1fr_1fr_1fr] gap-2 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Session ID</div>
          <div>Device ID</div>
          <div>Stream ID</div>
          <div>Started</div>
          <div>Ended</div>
          <div>Duration</div>
        </div>

        {sessions.length === 0 ? (
          <div className="px-4 py-6 text-sm text-neutral-500">No sessions found.</div>
        ) : (
          sessions.map((session) => (
            <div
              key={`${session.session_id}-${session.device_id}`}
              className="grid min-w-[1100px] grid-cols-[2fr_2fr_1fr_1fr_1fr_1fr] gap-2 border-b border-neutral-100 px-4 py-3 text-sm"
            >
              <div className="truncate" title={session.session_id}>
                {session.session_id}
              </div>
              <div className="truncate" title={session.device_id}>
                {session.device_id}
              </div>
              <div className="truncate" title={session.stream_id || ""}>
                {session.stream_id || "-"}
              </div>
              <div className="text-neutral-600">{formatDateTime(session.started_at)}</div>
              <div className="text-neutral-600">{formatDateTime(session.ended_at)}</div>
              <div className="font-mono">{formatDuration(session.duration_seconds)}</div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
