import { createServerSupabase } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import CloudinaryMediaLibraryField from "@/components/cms/CloudinaryMediaLibraryField";
import { DISTRICT_OPTIONS } from "@/lib/districts";
import { getRequiredEventAddress } from "@/lib/events";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("events")
    .select(
      "id, district_key, title, description, location, location_name, address, city, state, zip, start_at, end_at, status, image_url, submitter_id, link_1_url, link_1_text, link_2_url, link_2_text, is_school_sports"
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    return <p>Event not found.</p>;
  }

  const event = data;
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
    const supabase = await createServerSupabase();
    const nextDistrictKey = String(formData.get("district_key") || event.district_key);
    const title = String(formData.get("title") || "").trim();
    const startAt = String(formData.get("start_at") || "");
    const { error: addressError, addressFields } = getRequiredEventAddress(formData);

    if (!title || !startAt) {
      redirect(`/cms/calendar?district=${encodeURIComponent(nextDistrictKey)}&error=${encodeURIComponent("Title and start time are required.")}`);
    }
    if (addressError || !addressFields) {
      redirect(`/cms/calendar?district=${encodeURIComponent(nextDistrictKey)}&error=${encodeURIComponent(addressError || "Event address is required.")}`);
    }

    const { error } = await supabase
      .from("events")
      .update({
        district_key: nextDistrictKey,
        title,
        description: String(formData.get("description") || "").trim() || null,
        ...addressFields,
        start_at: startAt,
        end_at: String(formData.get("end_at") || "") || null,
        image_url: String(formData.get("image_url") || "") || null,
        status: String(formData.get("status") || "published"),
        is_school_sports: formData.get("is_school_sports") === "on",
        link_1_url: String(formData.get("link_1_url") || "").trim() || null,
        link_1_text: String(formData.get("link_1_text") || "").trim() || null,
        link_2_url: String(formData.get("link_2_url") || "").trim() || null,
        link_2_text: String(formData.get("link_2_text") || "").trim() || null,
      })
      .eq("id", id);
    if (error) {
      redirect(`/cms/calendar?district=${encodeURIComponent(nextDistrictKey)}&error=${encodeURIComponent(`Unable to update event: ${error.message}`)}`);
    }
    revalidatePath("/cms/calendar");
    revalidatePath("/calendar");
    redirect(`/cms/calendar?district=${encodeURIComponent(nextDistrictKey)}`);
  }

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Edit Event</h1>
        <p className="text-sm text-neutral-500">Update calendar details.</p>
      </header>
      {submitter && (
        <section className="rounded border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-600">Submitter Contact</h2>
          <p className="mt-2 text-sm text-neutral-700">Name: {submitter.name}</p>
          <p className="text-sm text-neutral-700">Phone: {submitter.phone}</p>
          <p className="text-sm text-neutral-700">Email: {submitter.email}</p>
        </section>
      )}
      <form action={updateEvent} className="grid gap-3 rounded border border-neutral-200 bg-white p-6 md:grid-cols-2">
        <select name="district_key" defaultValue={event.district_key} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {DISTRICT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input name="title" defaultValue={event.title} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        <input name="location_name" defaultValue={event.location_name || ""} placeholder="Location name" required className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        <input name="address" defaultValue={event.address || ""} placeholder="Address" required className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        <input name="city" defaultValue={event.city || ""} placeholder="City" required className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        <input name="state" defaultValue={event.state || "IA"} placeholder="State" required className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        <input name="zip" defaultValue={event.zip || ""} placeholder="Zip" required className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        <input name="start_at" type="datetime-local" defaultValue={event.start_at?.slice(0, 16)} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        <input name="end_at" type="datetime-local" defaultValue={event.end_at?.slice(0, 16) || ""} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        <select name="status" defaultValue={event.status} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
        <label className="inline-flex items-center gap-2 rounded border border-neutral-200 px-3 py-2 text-sm">
          <input name="is_school_sports" type="checkbox" defaultChecked={event.is_school_sports} />
          School Sports
        </label>
        <textarea name="description" defaultValue={event.description || ""} className="min-h-[100px] rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2" />
        <input name="link_1_url" defaultValue={event.link_1_url || ""} placeholder="Link 1" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        <input name="link_1_text" defaultValue={event.link_1_text || ""} placeholder="Text 1" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        <input name="link_2_url" defaultValue={event.link_2_url || ""} placeholder="Link 2" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        <input name="link_2_text" defaultValue={event.link_2_text || ""} placeholder="Text 2" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        <div className="md:col-span-2">
          <CloudinaryMediaLibraryField name="image_url" label="Event Image" folder="krtr/events" initialUrl={event.image_url || ""} />
        </div>
        <button type="submit" className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white md:col-span-2">
          Save Changes
        </button>
      </form>
    </div>
  );
}
