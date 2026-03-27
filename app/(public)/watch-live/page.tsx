import LiveVideoPlayer from "@/components/public/LiveVideoPlayer";
import { createServiceClient } from "@/lib/supabase/admin";
import { getCurrentDistrictKey } from "@/lib/districtServer";
import { isLiveBySchedule, type StreamScheduleRow } from "@/lib/streamSchedule";

export const dynamic = "force-dynamic";

type StreamConfig = {
  is_live: boolean | null;
  stream_id: string | null;
  hls_url: string | null;
  mode: "manual" | "auto" | null;
  timezone: string | null;
  updated_at: string | null;
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatClock(time: string) {
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText || "0");
  const minute = Number(minuteText || "0");
  const date = new Date(Date.UTC(2000, 0, 1, hour, minute));

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function formatUpdatedAt(value: string | null, timezone: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

export default async function WatchLivePage() {
  const districtKey = getCurrentDistrictKey();
  const supabase = createServiceClient();
  const [{ data: configData, error: configError }, { data: scheduleData, error: scheduleError }] =
    await Promise.all([
      supabase
        .from("stream_config")
        .select("is_live, stream_id, hls_url, mode, timezone, updated_at")
        .eq("district_key", districtKey)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("stream_schedule")
        .select("id, day_of_week, start_time, end_time, is_active")
        .eq("district_key", districtKey)
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true }),
    ]);

  if (configError) {
    console.error("[WatchLivePage] stream_config query failed", configError);
    throw new Error(`[WatchLivePage] ${configError.message}`);
  }

  if (scheduleError) {
    console.error("[WatchLivePage] stream_schedule query failed", scheduleError);
    throw new Error(`[WatchLivePage] ${scheduleError.message}`);
  }

  const config = (configData || {}) as StreamConfig;
  const timezone = config.timezone || "America/Chicago";
  const scheduleRows = ((scheduleData || []) as StreamScheduleRow[]).filter(
    (row) => row.is_active !== false
  );
  const isLiveEffective =
    (config.mode || "manual") === "auto"
      ? isLiveBySchedule(scheduleRows, timezone)
      : !!config.is_live;
  const streamUrl = isLiveEffective ? config.hls_url?.trim() || null : null;
  const updatedAtLabel = formatUpdatedAt(config.updated_at, timezone);

  return (
    <main className="mx-auto max-w-site px-4 py-6">
      <section className="rounded-lg bg-white p-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Watch Live Broadcast</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Live player and current broadcast schedule.
          </p>
          {updatedAtLabel && (
            <p className="mt-2 text-xs text-neutral-500">
              Stream config updated: {updatedAtLabel} ({timezone})
            </p>
          )}
        </header>

        {streamUrl ? (
          <div className="grid gap-4">
            <div className="rounded border border-neutral-200 p-4">
              <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-red-600">
                Live Now
              </p>
              <LiveVideoPlayer streamUrl={streamUrl} streamId={config.stream_id || null} />
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="rounded border border-neutral-200 p-4">
              <p className="text-sm font-semibold text-neutral-900">No active stream right now.</p>
              <p className="mt-1 text-sm text-neutral-600">
                Current weekly broadcast schedule:
              </p>
            </div>

            <div className="overflow-hidden rounded border border-neutral-200">
              <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
                <div>Day</div>
                <div>Start</div>
                <div>End</div>
              </div>
              {scheduleRows.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 border-b border-neutral-100 px-4 py-3 text-sm"
                >
                  <div>{WEEKDAYS[row.day_of_week] || row.day_of_week}</div>
                  <div>{formatClock(row.start_time)}</div>
                  <div>{formatClock(row.end_time)}</div>
                </div>
              ))}
              {scheduleRows.length === 0 && (
                <div className="px-4 py-4 text-sm text-neutral-500">
                  No broadcast windows are configured.
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
