import { createServerSupabase } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import ImageUploadField from "@/components/shared/ImageUploadField";

export default async function EditEventPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerSupabase();
  const { data: event } = await supabase
    .from("events")
    .select(
      "id, title, description, location, start_at, end_at, status, image_url, submitter_id"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!event) {
    return <p>Event not found.</p>;
  }

  let submitter: { name: string; phone: string; email: string } | null = null;
  if (event.submitter_id) {
    const { data: submitterRow } = await supabase
      .from("event_submitters")
      .select("name, phone, email")
      .eq("id", event.submitter_id)
      .maybeSingle();
    submitter = submitterRow || null;
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
        image_url: String(formData.get("image_url") || "") || null,
        status: String(formData.get("status") || "published"),
      })
      .eq("id", params.id);
    revalidatePath("/cms/calendar");
    revalidatePath("/calendar");
    redirect(`/cms/calendar/${params.id}`);
  }

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Edit Event</h1>
        <p className="text-sm text-neutral-500">Update calendar details.</p>
      </header>
      {submitter && (
        <section className="rounded border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-600">
            Submitter Contact
          </h2>
          <p className="mt-2 text-sm text-neutral-700">Name: {submitter.name}</p>
          <p className="text-sm text-neutral-700">Phone: {submitter.phone}</p>
          <p className="text-sm text-neutral-700">Email: {submitter.email}</p>
        </section>
      )}
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
        <div className="md:col-span-2">
          <ImageUploadField
            name="image_url"
            label="Event Image"
            folder="krtr/events"
            initialUrl={event.image_url || ""}
          />
        </div>
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
