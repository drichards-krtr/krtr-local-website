import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireNrcsStaff } from "@/lib/auth";
import { getNrcsDistrictContext } from "@/lib/districts";
import { formatNaiveDateTime } from "@/lib/localDates";
import { createNrcsServiceClient } from "@/lib/server";
import { syncNrcsEventById } from "@/lib/eventSyncServer";

type EventRow = {
  id: string;
  district_key: string;
  title: string;
  start_at: string;
  end_at: string | null;
  status: string;
  city: string;
  nrcs_event_classification_terms: { name: string; kind: string } | Array<{ name: string; kind: string }> | null;
};

function syncSearchParams(syncResult: Awaited<ReturnType<typeof syncNrcsEventById>>) {
  if (syncResult.ok) {
    const params = new URLSearchParams({ sync: "success" });
    if (syncResult.cmsEventId) params.set("cmsEventId", syncResult.cmsEventId);
    if (syncResult.cmsSupabaseHost) params.set("cmsSupabaseHost", syncResult.cmsSupabaseHost);
    if (syncResult.cmsStatus) params.set("cmsStatus", syncResult.cmsStatus);
    if (syncResult.nrcsSourceId) params.set("nrcsSourceId", syncResult.nrcsSourceId);
    params.set("cmsApiUrl", syncResult.cmsApiUrl);
    if (syncResult.cmsTable) params.set("cmsTable", syncResult.cmsTable);
    return params.toString();
  }

  const params = new URLSearchParams({
    sync: syncResult.skipped ? "skipped" : "failed",
    syncMessage: syncResult.error || "CMS sync failed",
  });
  return params.toString();
}

async function duplicateEvent(formData: FormData) {
  "use server";
  await requireNrcsStaff("contributor");

  const id = String(formData.get("id") || "");
  const service = createNrcsServiceClient();
  const { data: event, error } = await service
    .from("nrcs_events")
    .select(
      "district_key, title, body_html, location_name, address, city, state, zip, location, start_at, end_at, image_url, classification_term_id"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !event) {
    redirect(`/events?error=${encodeURIComponent(error?.message || "Event not found")}`);
  }

  const { data: copy, error: copyError } = await service
    .from("nrcs_events")
    .insert({
      ...event,
      title: `${event.title} Copy`,
      status: "draft",
    })
    .select("id, district_key")
    .single();

  if (copyError) {
    redirect(`/events?error=${encodeURIComponent(copyError.message)}`);
  }

  revalidatePath("/events");
  const syncResult = await syncNrcsEventById(copy.id);
  redirect(`/events/${copy.id}?district=${copy.district_key}&success=duplicated&${syncSearchParams(syncResult)}`);
}

async function archiveEvent(formData: FormData) {
  "use server";
  await requireNrcsStaff("contributor");

  const id = String(formData.get("id") || "");
  const districtKey = String(formData.get("district_key") || "dlpc");
  const service = createNrcsServiceClient();
  const { error } = await service.from("nrcs_events").update({ status: "archived" }).eq("id", id);

  if (error) {
    redirect(`/events?district=${districtKey}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/events");
  const syncResult = await syncNrcsEventById(id);
  redirect(`/events?district=${districtKey}&success=archived&${syncSearchParams(syncResult)}`);
}

export default async function NrcsEventsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    district?: string;
    status?: string;
    error?: string;
    success?: string;
    sync?: "success" | "failed" | "skipped";
    syncMessage?: string;
    cmsEventId?: string;
    cmsSupabaseHost?: string;
    cmsStatus?: string;
    nrcsSourceId?: string;
    cmsApiUrl?: string;
    cmsTable?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  await requireNrcsStaff("contributor");
  const { activeDistrict, allowedDistricts } = await getNrcsDistrictContext();
  const districtKey =
    resolvedSearchParams?.district && allowedDistricts.some((district) => district.district_key === resolvedSearchParams.district)
      ? resolvedSearchParams.district
      : activeDistrict?.district_key || "dlpc";
  const status = resolvedSearchParams?.status || "all";

  const service = createNrcsServiceClient();
  let query = service
    .from("nrcs_events")
    .select("id, district_key, title, start_at, end_at, status, city, nrcs_event_classification_terms(name, kind)")
    .eq("district_key", districtKey)
    .order("start_at", { ascending: true });

  if (status !== "all") {
    query = query.eq("status", status === "upcoming" ? "published" : status);
  }

  const { data, error } = await query.limit(200);
  if (error) {
    throw new Error(`Unable to load events: ${error.message}`);
  }

  const events = (data || []) as unknown as EventRow[];

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Events</h1>
          <p className="text-sm text-neutral-500">Create, edit, duplicate, and publish Community Calendar events.</p>
        </div>
        <Link href={`/events/new?district=${districtKey}`} className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
          New Event
        </Link>
      </header>

      {resolvedSearchParams?.error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{resolvedSearchParams.error}</p>}
      {resolvedSearchParams?.success && (
        <div className="rounded border border-green-300 bg-green-50 p-4 text-sm text-green-800">
          <p className="text-base font-semibold">NRCS update successful.</p>
        </div>
      )}
      {resolvedSearchParams?.sync === "success" && (
        <div className="rounded border border-green-300 bg-green-50 p-4 text-sm text-green-800">
          <p className="text-base font-semibold">CMS sync successful.</p>
          <p className="mt-1">CMS received the latest event state.</p>
          <dl className="mt-3 grid gap-1 text-xs text-green-900 md:grid-cols-2">
            {resolvedSearchParams.cmsEventId && (
              <>
                <dt className="font-semibold">CMS Event ID</dt>
                <dd>{resolvedSearchParams.cmsEventId}</dd>
              </>
            )}
            {resolvedSearchParams.cmsApiUrl && (
              <>
                <dt className="font-semibold">CMS API URL</dt>
                <dd>{resolvedSearchParams.cmsApiUrl}</dd>
              </>
            )}
            {resolvedSearchParams.cmsTable && (
              <>
                <dt className="font-semibold">CMS Table</dt>
                <dd>{resolvedSearchParams.cmsTable}</dd>
              </>
            )}
            {resolvedSearchParams.cmsSupabaseHost && (
              <>
                <dt className="font-semibold">CMS Supabase Host</dt>
                <dd>{resolvedSearchParams.cmsSupabaseHost}</dd>
              </>
            )}
            {resolvedSearchParams.cmsStatus && (
              <>
                <dt className="font-semibold">CMS Status</dt>
                <dd>{resolvedSearchParams.cmsStatus}</dd>
              </>
            )}
            {resolvedSearchParams.nrcsSourceId && (
              <>
                <dt className="font-semibold">NRCS Source ID</dt>
                <dd>{resolvedSearchParams.nrcsSourceId}</dd>
              </>
            )}
          </dl>
          {resolvedSearchParams.cmsTable && resolvedSearchParams.cmsTable !== "events" && (
            <p className="mt-3 rounded border border-amber-300 bg-amber-100 p-2 text-xs text-amber-900">
              CMS did not report writing to the events table.
            </p>
          )}
        </div>
      )}
      {(resolvedSearchParams?.sync === "failed" || resolvedSearchParams?.sync === "skipped") && (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="text-base font-semibold">
            CMS sync {resolvedSearchParams.sync === "skipped" ? "skipped" : "failed"}.
          </p>
          <p className="mt-1">{resolvedSearchParams.syncMessage || "NRCS updated the event, but CMS did not confirm receipt."}</p>
        </div>
      )}

      <form className="flex flex-wrap gap-3 rounded border border-neutral-200 bg-white p-4">
        <select name="district" defaultValue={districtKey} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {allowedDistricts.map((district) => (
            <option key={district.district_key} value={district.district_key}>
              {district.display_name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          <option value="all">All</option>
          <option value="upcoming">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
        <button className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">Apply</button>
      </form>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Title</div>
          <div>When</div>
          <div>City</div>
          <div>Classification</div>
          <div>Actions</div>
        </div>
        {events.map((event) => (
          <div key={event.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 border-b border-neutral-100 px-4 py-3 text-sm">
            <div>
              <Link href={`/events/${event.id}?district=${districtKey}`} className="font-medium underline">
                {event.title}
              </Link>
              <div className="text-xs capitalize text-neutral-500">{event.status}</div>
            </div>
            <div>{formatNaiveDateTime(event.start_at)}</div>
            <div>{event.city}</div>
            <div>
              {Array.isArray(event.nrcs_event_classification_terms)
                ? event.nrcs_event_classification_terms[0]?.name || "-"
                : event.nrcs_event_classification_terms?.name || "-"}
            </div>
            <div className="flex flex-wrap gap-3">
              <form action={duplicateEvent}>
                <input type="hidden" name="id" value={event.id} />
                <button className="underline">Duplicate</button>
              </form>
              <form action={archiveEvent}>
                <input type="hidden" name="id" value={event.id} />
                <input type="hidden" name="district_key" value={districtKey} />
                <button className="underline">Archive</button>
              </form>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
