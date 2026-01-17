import { createServerSupabase } from "@/lib/supabase/server";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { search?: string; status?: string };
}) {
  const supabase = createServerSupabase();
  const search = searchParams.search?.trim() || "";
  const status = searchParams.status || "all";

  let query = supabase
    .from("events")
    .select("id, title, location, start_at, status")
    .order("start_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }
  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  const { data: events } = await query;

  async function addEvent(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    await supabase.from("events").insert({
      title: String(formData.get("title")),
      description: String(formData.get("description") || ""),
      location: String(formData.get("location") || ""),
      start_at: String(formData.get("start_at")),
      end_at: String(formData.get("end_at") || ""),
      status: String(formData.get("status") || "published"),
    });
  }

  async function unpublishEvent(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const id = String(formData.get("id"));
    await supabase.from("events").update({ status: "archived" }).eq("id", id);
  }

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <p className="text-sm text-neutral-500">Manage community events.</p>
      </header>

      <form className="flex flex-wrap gap-3 rounded border border-neutral-200 bg-white p-4">
        <input
          name="search"
          placeholder="Search events"
          defaultValue={search}
          className="w-64 rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          name="status"
          defaultValue={status}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="all">All status</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
        >
          Apply
        </button>
      </form>

      <section className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">New Event</h2>
        <form action={addEvent} className="grid gap-3 md:grid-cols-2">
          <input
            name="title"
            placeholder="Title"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="location"
            placeholder="Location"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="start_at"
            type="datetime-local"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            name="end_at"
            type="datetime-local"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <select
            name="status"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
          <textarea
            name="description"
            placeholder="Description"
            className="min-h-[80px] rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
          />
          <button
            type="submit"
            className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white md:col-span-2"
          >
            Save Event
          </button>
        </form>
      </section>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr] gap-2 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Title</div>
          <div>Location</div>
          <div>Date</div>
          <div>Status</div>
          <div>Actions</div>
        </div>
        {(events || []).map((event) => (
          <div
            key={event.id}
            className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr] gap-2 border-b border-neutral-100 px-4 py-3 text-sm"
          >
            <div>{event.title}</div>
            <div className="text-neutral-500">{event.location || "—"}</div>
            <div className="text-neutral-500">
              {new Date(event.start_at).toLocaleDateString()}
            </div>
            <div className="capitalize">{event.status}</div>
            <div className="flex gap-3">
              <a href={`/cms/calendar/${event.id}`} className="text-sm underline">
                Edit
              </a>
              <form action={unpublishEvent}>
                <input type="hidden" name="id" value={event.id} />
                <button type="submit" className="text-sm underline">
                  Unpublish
                </button>
              </form>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
