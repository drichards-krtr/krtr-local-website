import { createServerSupabase } from "@/lib/supabase/server";

export default async function EditEventPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerSupabase();
  const { data: event } = await supabase
    .from("events")
    .select("id, title, description, location, start_at, end_at, status")
    .eq("id", params.id)
    .maybeSingle();

  if (!event) {
    return <p>Event not found.</p>;
  }

  async function updateEvent(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    await supabase
      .from("events")
      .update({
        title: String(formData.get("title")),
        description: String(formData.get("description") || ""),
        location: String(formData.get("location") || ""),
        start_at: String(formData.get("start_at")),
        end_at: String(formData.get("end_at") || ""),
        status: String(formData.get("status") || "published"),
      })
      .eq("id", params.id);
  }

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Edit Event</h1>
        <p className="text-sm text-neutral-500">Update calendar details.</p>
      </header>
      <form action={updateEvent} className="grid gap-3 rounded border border-neutral-200 bg-white p-6 md:grid-cols-2">
        <input
          name="title"
          defaultValue={event.title}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          name="location"
          defaultValue={event.location || ""}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          name="start_at"
          type="datetime-local"
          defaultValue={event.start_at?.slice(0, 16)}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          name="end_at"
          type="datetime-local"
          defaultValue={event.end_at?.slice(0, 16) || ""}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          name="status"
          defaultValue={event.status}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
        <textarea
          name="description"
          defaultValue={event.description || ""}
          className="min-h-[100px] rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
        />
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white md:col-span-2"
        >
          Save Changes
        </button>
      </form>
    </div>
  );
}
