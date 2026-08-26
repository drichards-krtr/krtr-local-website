import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import NrcsEventForm, { type NrcsEventFormValue } from "@/components/NrcsEventForm";
import { requireNrcsStaff } from "@/lib/auth";
import { getNrcsDistrictContext } from "@/lib/districts";
import { getEventPayloadFromForm } from "@/lib/eventForms";
import type { EventClassificationTerm } from "@/lib/eventClassifications";
import { syncNrcsEventById } from "@/lib/eventSyncServer";
import { createNrcsServiceClient } from "@/lib/server";

function syncSearchParams(syncResult: Awaited<ReturnType<typeof syncNrcsEventById>>) {
  if (syncResult.ok) {
    return "sync=success";
  }

  return `sync=${syncResult.skipped ? "skipped" : "failed"}&syncMessage=${encodeURIComponent(
    syncResult.error || "CMS sync failed"
  )}`;
}

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
  revalidatePath("/events");
  redirect(`/events/${id}?district=${payload.district_key}&success=updated&${syncSearchParams(syncResult)}`);
}

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    district?: string;
    error?: string;
    success?: string;
    sync?: "success" | "failed" | "skipped";
    syncMessage?: string;
  }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  await requireNrcsStaff("contributor");
  const { allowedDistricts } = await getNrcsDistrictContext();
  const service = createNrcsServiceClient();
  const { data, error } = await service
    .from("nrcs_events")
    .select(
      "id, district_key, title, body_html, location_name, address, city, state, zip, start_at, end_at, image_url, status, classification_term_id"
    )
    .eq("id", id)
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
      {resolvedSearchParams?.error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{resolvedSearchParams.error}</p>}
      {resolvedSearchParams?.success && (
        <div className="rounded border border-green-300 bg-green-50 p-4 text-sm text-green-800">
          <p className="text-base font-semibold">NRCS save successful.</p>
          <p className="mt-1 capitalize">Event state: {event.status}.</p>
        </div>
      )}
      {resolvedSearchParams?.sync === "success" && (
        <div className="rounded border border-green-300 bg-green-50 p-4 text-sm text-green-800">
          <p className="text-base font-semibold">CMS sync successful.</p>
          <p className="mt-1">CMS received this event.</p>
        </div>
      )}
      {(resolvedSearchParams?.sync === "failed" || resolvedSearchParams?.sync === "skipped") && (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="text-base font-semibold">
            CMS sync {resolvedSearchParams.sync === "skipped" ? "skipped" : "failed"}.
          </p>
          <p className="mt-1">{resolvedSearchParams.syncMessage || "The event was saved in NRCS, but CMS did not confirm receipt."}</p>
        </div>
      )}
      <NrcsEventForm
        action={async (formData) => {
          "use server";
          formData.set("id", id);
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
