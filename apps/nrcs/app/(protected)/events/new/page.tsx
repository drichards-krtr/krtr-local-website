import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import NrcsEventForm from "@/components/NrcsEventForm";
import { requireNrcsStaff } from "@/lib/auth";
import { getNrcsDistrictContext } from "@/lib/districts";
import { getEventPayloadFromForm } from "@/lib/eventForms";
import type { EventClassificationTerm } from "@/lib/eventClassifications";
import { syncNrcsEventById } from "@/lib/eventSyncServer";
import { createNrcsServiceClient } from "@/lib/server";

function syncSearchParams(syncResult: Awaited<ReturnType<typeof syncNrcsEventById>>) {
  if (syncResult.ok) {
    const params = new URLSearchParams({ sync: "success" });
    if (syncResult.cmsEventId) params.set("cmsEventId", syncResult.cmsEventId);
    if (syncResult.cmsSupabaseHost) params.set("cmsSupabaseHost", syncResult.cmsSupabaseHost);
    if (syncResult.cmsStatus) params.set("cmsStatus", syncResult.cmsStatus);
    if (syncResult.nrcsSourceId) params.set("nrcsSourceId", syncResult.nrcsSourceId);
    return params.toString();
  }

  const params = new URLSearchParams({
    sync: syncResult.skipped ? "skipped" : "failed",
    syncMessage: syncResult.error || "CMS sync failed",
  });
  return params.toString();
}

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
  revalidatePath("/events");
  redirect(`/events/${data.id}?district=${data.district_key}&success=created&${syncSearchParams(syncResult)}`);
}

export default async function NewEventPage({
  searchParams,
}: {
  searchParams?: Promise<{ district?: string; error?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  await requireNrcsStaff("contributor");
  const { activeDistrict, allowedDistricts } = await getNrcsDistrictContext();
  const districtKey =
    resolvedSearchParams?.district && allowedDistricts.some((district) => district.district_key === resolvedSearchParams.district)
      ? resolvedSearchParams.district
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
      {resolvedSearchParams?.error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{resolvedSearchParams.error}</p>}
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
