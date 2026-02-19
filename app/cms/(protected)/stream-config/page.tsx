import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";

const WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

type StreamConfig = {
  is_live: boolean | null;
  stream_id: string | null;
  hls_url: string | null;
  mode: "manual" | "auto" | null;
  timezone: string | null;
  updated_at: string | null;
};

type StreamSchedule = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

export default async function StreamConfigPage() {
  const supabase = createServiceClient();
  const [{ data: configData }, { data: scheduleData }] = await Promise.all([
    supabase
      .from("stream_config")
      .select("is_live, stream_id, hls_url, mode, timezone, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("stream_schedule")
      .select("id, day_of_week, start_time, end_time, is_active")
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true }),
  ]);

  const config = (configData || {}) as StreamConfig;
  const schedules = (scheduleData || []) as StreamSchedule[];

  async function saveConfig(formData: FormData) {
    "use server";
    const service = createServiceClient();
    const mode = String(formData.get("mode") || "manual");
    await service.from("stream_config").insert({
      mode: mode === "auto" ? "auto" : "manual",
      is_live: mode === "auto" ? false : formData.get("is_live") === "on",
      stream_id: String(formData.get("stream_id") || "").trim() || null,
      hls_url: String(formData.get("hls_url") || "").trim() || null,
      timezone: String(formData.get("timezone") || "America/Chicago").trim(),
    });
    revalidatePath("/cms/stream-config");
    revalidatePath("/api/live");
    redirect("/cms/stream-config");
  }

  async function addSchedule(formData: FormData) {
    "use server";
    const service = createServiceClient();
    await service.from("stream_schedule").insert({
      day_of_week: Number(formData.get("day_of_week")),
      start_time: String(formData.get("start_time") || ""),
      end_time: String(formData.get("end_time") || ""),
      is_active: formData.get("is_active") === "on",
    });
    revalidatePath("/cms/stream-config");
    revalidatePath("/api/live");
    redirect("/cms/stream-config");
  }

  async function deleteSchedule(formData: FormData) {
    "use server";
    const service = createServiceClient();
    const id = String(formData.get("id") || "");
    await service.from("stream_schedule").delete().eq("id", id);
    revalidatePath("/cms/stream-config");
    revalidatePath("/api/live");
    redirect("/cms/stream-config");
  }

  async function toggleSchedule(formData: FormData) {
    "use server";
    const service = createServiceClient();
    const id = String(formData.get("id") || "");
    const next = formData.get("next") === "true";
    await service.from("stream_schedule").update({ is_active: next }).eq("id", id);
    revalidatePath("/cms/stream-config");
    revalidatePath("/api/live");
    redirect("/cms/stream-config");
  }

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Stream Config</h1>
        <p className="text-sm text-neutral-500">
          Configure manual stream state or enable automatic schedule-driven live status.
        </p>
      </header>

      <section className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Current Config</h2>
        <form action={saveConfig} className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Mode</label>
            <select
              name="mode"
              defaultValue={config.mode || "manual"}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="manual">Manual</option>
              <option value="auto">Auto (Use Schedule)</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Timezone</label>
            <input
              name="timezone"
              defaultValue={config.timezone || "America/Chicago"}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="is_live"
                defaultChecked={!!config.is_live}
              />
              Set live now (used when mode is Manual)
            </label>
          </div>
          <div>
            <label className="text-sm font-medium">Stream ID</label>
            <input
              name="stream_id"
              defaultValue={config.stream_id || ""}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium">HLS URL</label>
            <input
              name="hls_url"
              defaultValue={config.hls_url || ""}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white md:col-span-2"
          >
            Save Stream Config
          </button>
        </form>
        {config.updated_at && (
          <p className="mt-2 text-xs text-neutral-500">
            Last updated: {new Date(config.updated_at).toLocaleString()}
          </p>
        )}
      </section>

      <section className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Weekly Schedule</h2>
        <form action={addSchedule} className="grid gap-3 md:grid-cols-5">
          <select
            name="day_of_week"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
            defaultValue="1"
          >
            {WEEKDAYS.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>
          <input
            name="start_time"
            type="time"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="end_time"
            type="time"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_active" defaultChecked />
            Active
          </label>
          <button
            type="submit"
            className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
          >
            Add Window
          </button>
        </form>

        <div className="mt-4 rounded border border-neutral-200">
          <div className="grid grid-cols-[1.2fr_1fr_1fr_0.8fr_1fr] gap-2 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
            <div>Day</div>
            <div>Start</div>
            <div>End</div>
            <div>Status</div>
            <div>Actions</div>
          </div>
          {schedules.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[1.2fr_1fr_1fr_0.8fr_1fr] gap-2 border-b border-neutral-100 px-4 py-3 text-sm"
            >
              <div>{WEEKDAYS.find((day) => day.value === row.day_of_week)?.label || row.day_of_week}</div>
              <div>{row.start_time.slice(0, 5)}</div>
              <div>{row.end_time.slice(0, 5)}</div>
              <div>{row.is_active ? "Active" : "Disabled"}</div>
              <div className="flex gap-2">
                <form action={toggleSchedule}>
                  <input type="hidden" name="id" value={row.id} />
                  <input
                    type="hidden"
                    name="next"
                    value={row.is_active ? "false" : "true"}
                  />
                  <button type="submit" className="text-sm underline">
                    {row.is_active ? "Disable" : "Enable"}
                  </button>
                </form>
                <form action={deleteSchedule}>
                  <input type="hidden" name="id" value={row.id} />
                  <button type="submit" className="text-sm text-red-600 underline">
                    Delete
                  </button>
                </form>
              </div>
            </div>
          ))}
          {schedules.length === 0 && (
            <div className="px-4 py-4 text-sm text-neutral-500">
              No schedule windows yet. Add at least one and set mode to Auto.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
