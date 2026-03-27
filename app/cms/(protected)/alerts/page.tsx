import { createServerSupabase } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  formatNaiveDateTime,
  getDateTimeTextInTimeZone,
  getNaiveDateTimeText,
} from "@/lib/dates";
import { DISTRICT_OPTIONS, parseDistrictKey } from "@/lib/districts";

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: { active?: string; search?: string; district?: string };
}) {
  const supabase = createServerSupabase();
  const districtKey = parseDistrictKey(searchParams.district) || "dlpc";
  // Cleanup: remove alerts that expired more than 7 days ago
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("alerts").delete().lt("end_at", sevenDaysAgo);
  } catch (error) {
    // Keep page render working even if cleanup fails
    console.error("[Alerts cleanup] failed", error);
  }
  const active = searchParams.active || "all";
  const search = searchParams.search?.trim() || "";

  let query = supabase
    .from("alerts")
    .select("id, message, link_url, active, start_at, end_at")
    .eq("district_key", districtKey)
    .order("created_at", { ascending: false });

  if (active !== "all") {
    query = query.eq("active", active === "true");
  }
  if (search) {
    query = query.ilike("message", `%${search}%`);
  }

  const { data: alerts } = await query;
  const nowChicago = getDateTimeTextInTimeZone();

  function isActiveNow(alert: {
    active: boolean;
    start_at: string | null;
    end_at: string | null;
  }) {
    if (!alert.active) return false;
    const startOk = !alert.start_at || getNaiveDateTimeText(alert.start_at) <= nowChicago;
    const endOk = !alert.end_at || getNaiveDateTimeText(alert.end_at) >= nowChicago;
    return startOk && endOk;
  }

  async function addAlert(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    await supabase.from("alerts").insert({
      district_key: String(formData.get("district_key") || districtKey),
      message: String(formData.get("message")),
      link_url: String(formData.get("link_url") || ""),
      start_at: String(formData.get("start_at") || ""),
      end_at: String(formData.get("end_at") || ""),
      active: formData.get("active") === "on",
    });
    revalidatePath("/", "layout");
    revalidatePath("/cms/alerts");
    redirect(`/cms/alerts?district=${districtKey}`);
  }

  async function toggleAlert(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const id = String(formData.get("id"));
    const next = formData.get("next") === "true";
    await supabase.from("alerts").update({ active: next }).eq("id", id);
    revalidatePath("/", "layout");
    revalidatePath("/cms/alerts");
    redirect(`/cms/alerts?district=${districtKey}`);
  }

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Breaking Alerts</h1>
        <p className="text-sm text-neutral-500">
          Control the breaking news banner.
        </p>
      </header>

      <form className="flex flex-wrap gap-3 rounded border border-neutral-200 bg-white p-4">
        <select
          name="district"
          defaultValue={districtKey}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          {DISTRICT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          name="search"
          placeholder="Search alerts"
          defaultValue={search}
          className="w-56 rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          name="active"
          defaultValue={active}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="all">All</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
        >
          Apply
        </button>
      </form>

      <section className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">New Alert</h2>
        <form action={addAlert} className="grid gap-3">
          <select
            name="district_key"
            defaultValue={districtKey}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          >
            {DISTRICT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <textarea
            name="message"
            placeholder="Breaking alert message"
            required
            className="min-h-[80px] rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="link_url"
            placeholder="Optional link URL"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <input
              name="start_at"
              type="datetime-local"
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              name="end_at"
              type="datetime-local"
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" />
            Active
          </label>
          <button
            type="submit"
            className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
          >
            Save Alert
          </button>
        </form>
      </section>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Message</div>
          <div>Window</div>
          <div>Status</div>
          <div>Active Now</div>
          <div>Actions</div>
        </div>
        {(alerts || []).map((alert) => (
          <div
            key={alert.id}
            className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 border-b border-neutral-100 px-4 py-3 text-sm"
          >
            <div className="truncate">{alert.message}</div>
            <div className="text-neutral-500">
              {formatNaiveDateTime(alert.start_at)} / {formatNaiveDateTime(alert.end_at)}
            </div>
            <div>{alert.active ? "Active" : "Inactive"}</div>
            <div>{isActiveNow(alert) ? "Yes" : "No"}</div>
            <div className="flex gap-3">
              <a href={`/cms/alerts/${alert.id}?district=${districtKey}`} className="text-sm underline">
                Edit
              </a>
              <form action={toggleAlert}>
                <input type="hidden" name="id" value={alert.id} />
                <input
                  type="hidden"
                  name="next"
                  value={(!alert.active).toString()}
                />
                <button type="submit" className="text-sm underline">
                  {alert.active ? "Unpublish" : "Publish"}
                </button>
              </form>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
