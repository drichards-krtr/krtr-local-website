import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import NrcsEventForm, { type NrcsEventFormValue } from "@/components/NrcsEventForm";
import { requireNrcsStaff } from "@/lib/auth";
import { getNrcsDistrictContext } from "@/lib/districts";
import { getEventPayloadFromForm } from "@/lib/eventForms";
import type { EventClassificationTerm } from "@/lib/eventClassifications";
import { syncNrcsEventById } from "@/lib/eventSyncServer";
import { createNrcsServiceClient } from "@/lib/server";

async function updateEvent(formData: FormData) {
  "use server";
  await requireNrcsStaff("contributor");

  const id = String(formData.get("id") || "");
  const fallbackDistrictKey = String(formData.get("district_key") || "dlpc");
  const { error: payloadError, payload } = getEventPayloadFromForm(formData, fallbackDistrictKey);

  if (payloadError || !payload) {
    redirect(`/events/${id}?district=${fallbackDistrictKey}&error=${encodeURIComponent(payloadError || "Invalid event")}`);
  }

  const service = createNrcsServiceClient();
  const { error } = await service.from("nrcs_events").update(payload).eq("id", id);

  if (error) {
    redirect(`/events/${id}?district=${payload.district_key}&error=${encodeURIComponent(error.message)}`);
  }

  const syncResult = await syncNrcsEventById(id);
  if (!syncResult.ok) {
    redirect(
      `/events/${id}?district=${payload.district_key}&error=${encodeURIComponent(
        `Event saved, but CMS sync failed: ${syncResult.error}`
      )}`
    );
  }
  revalidatePath("/events");
  redirect(`/events/${id}?district=${payload.district_key}&success=updated`);
}

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { district?: string; error?: string; success?: string };
}) {
  await requireNrcsStaff("contributor");
  const { allowedDistricts } = await getNrcsDistrictContext();
  const service = createNrcsServiceClient();
  const { data, error } = await service
    .from("nrcs_events")
    .select(
      "id, district_key, title, body_html, location_name, address, city, state, zip, start_at, end_at, image_url, status, classification_term_id"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load event: ${error.message}`);
  }

  if (!data) {
    return <p>Event not found.</p>;
  }

  const event = data as NrcsEventFormValue;
  const { data: terms } = await service
    .from("nrcs_event_classification_terms")
    .select("id, district_key, kind, name, enabled")
    .eq("district_key", event.district_key);

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Edit Event</h1>
        <p className="text-sm text-neutral-500">Update event details, classification, and publication status.</p>
      </header>
      {searchParams?.error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{searchParams.error}</p>}
      {searchParams?.success && <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">Saved.</p>}
      <NrcsEventForm
        action={async (formData) => {
          "use server";
          formData.set("id", params.id);
          await updateEvent(formData);
        }}
        event={event}
        districtOptions={allowedDistricts.map((district) => ({
          district_key: district.district_key,
          display_name: district.display_name,
        }))}
        selectedDistrictKey={event.district_key}
        terms={(terms || []) as EventClassificationTerm[]}
        submitLabel="Save Changes"
      />
    </div>
  );
}
