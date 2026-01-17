import { createServerSupabase } from "@/lib/supabase/server";

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: { active?: string; search?: string };
}) {
  const supabase = createServerSupabase();
  const active = searchParams.active || "all";
  const search = searchParams.search?.trim() || "";

  let query = supabase
    .from("alerts")
    .select("id, message, link_url, active, start_at, end_at")
    .order("created_at", { ascending: false });

  if (active !== "all") {
    query = query.eq("active", active === "true");
  }
  if (search) {
    query = query.ilike("message", `%${search}%`);
  }

  const { data: alerts } = await query;

  async function addAlert(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    await supabase.from("alerts").insert({
      message: String(formData.get("message")),
      link_url: String(formData.get("link_url") || ""),
      start_at: String(formData.get("start_at") || ""),
      end_at: String(formData.get("end_at") || ""),
      active: formData.get("active") === "on",
    });
  }

  async function toggleAlert(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const id = String(formData.get("id"));
    const next = formData.get("next") === "true";
    await supabase.from("alerts").update({ active: next }).eq("id", id);
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
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Message</div>
          <div>Window</div>
          <div>Status</div>
          <div>Actions</div>
        </div>
        {(alerts || []).map((alert) => (
          <div
            key={alert.id}
            className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-neutral-100 px-4 py-3 text-sm"
          >
            <div className="truncate">{alert.message}</div>
            <div className="text-neutral-500">
              {alert.start_at ? new Date(alert.start_at).toLocaleDateString() : "—"}{" "}
              / {alert.end_at ? new Date(alert.end_at).toLocaleDateString() : "—"}
            </div>
            <div>{alert.active ? "Active" : "Inactive"}</div>
            <div className="flex gap-3">
              <a href={`/cms/alerts/${alert.id}`} className="text-sm underline">
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
