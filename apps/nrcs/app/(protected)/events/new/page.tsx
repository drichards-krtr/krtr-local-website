import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import NrcsEventForm from "@/components/NrcsEventForm";
import { requireNrcsStaff } from "@/lib/auth";
import { getNrcsDistrictContext } from "@/lib/districts";
import { getEventPayloadFromForm } from "@/lib/eventForms";
import type { EventClassificationTerm } from "@/lib/eventClassifications";
import { syncNrcsEventById } from "@/lib/eventSyncServer";
import { createNrcsServiceClient } from "@/lib/server";

async function createEvent(formData: FormData) {
  "use server";
  await requireNrcsStaff("contributor");

  const fallbackDistrictKey = String(formData.get("district_key") || "dlpc");
  const { error: payloadError, payload } = getEventPayloadFromForm(formData, fallbackDistrictKey);

  if (payloadError || !payload) {
    redirect(`/events/new?district=${fallbackDistrictKey}&error=${encodeURIComponent(payloadError || "Invalid event")}`);
  }

  const service = createNrcsServiceClient();
  const { data, error } = await service.from("nrcs_events").insert(payload).select("id, district_key").single();

  if (error) {
    redirect(`/events/new?district=${payload.district_key}&error=${encodeURIComponent(error.message)}`);
  }

  const syncResult = await syncNrcsEventById(data.id);
  if (!syncResult.ok) {
    redirect(
      `/events/${data.id}?district=${data.district_key}&error=${encodeURIComponent(
        `Event saved, but CMS sync failed: ${syncResult.error}`
      )}`
    );
  }
  revalidatePath("/events");
  redirect(`/events/${data.id}?district=${data.district_key}&success=created`);
}

export default async function NewEventPage({
  searchParams,
}: {
  searchParams?: { district?: string; error?: string };
}) {
  await requireNrcsStaff("contributor");
  const { activeDistrict, allowedDistricts } = await getNrcsDistrictContext();
  const districtKey =
    searchParams?.district && allowedDistricts.some((district) => district.district_key === searchParams.district)
      ? searchParams.district
      : activeDistrict?.district_key || "dlpc";

  const service = createNrcsServiceClient();
  const { data: terms } = await service
    .from("nrcs_event_classification_terms")
    .select("id, district_key, kind, name, enabled")
    .eq("district_key", districtKey)
    .eq("enabled", true);

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">New Event</h1>
        <p className="text-sm text-neutral-500">Create a draft or published Community Calendar event.</p>
      </header>
      {searchParams?.error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{searchParams.error}</p>}
      <NrcsEventForm
        action={createEvent}
        districtOptions={allowedDistricts.map((district) => ({
          district_key: district.district_key,
          display_name: district.display_name,
        }))}
        selectedDistrictKey={districtKey}
        terms={(terms || []) as EventClassificationTerm[]}
        submitLabel="Save Event"
      />
    </div>
  );
}
