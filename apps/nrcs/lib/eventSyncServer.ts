import { createNrcsServiceClient } from "./server";
import { syncEventToCms, type CmsSyncResult } from "./cmsSync";
import type { EventClassificationKind } from "./eventClassifications";

type EventWithTerm = {
  id: string;
  district_key: string;
  title: string;
  body_html: string | null;
  location_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  location: string | null;
  start_at: string;
  end_at: string | null;
  image_url: string | null;
  status: "draft" | "published" | "archived";
  nrcs_event_classification_terms?:
    | {
    kind: EventClassificationKind;
    name: string;
    enabled: boolean;
  }
    | Array<{
        kind: EventClassificationKind;
        name: string;
        enabled: boolean;
      }>
    | null;
};

export async function syncNrcsEventById(id: string): Promise<CmsSyncResult> {
  const service = createNrcsServiceClient();
  const { data, error } = await service
    .from("nrcs_events")
    .select(
      "id, district_key, title, body_html, location_name, address, city, state, zip, location, start_at, end_at, image_url, status, nrcs_event_classification_terms(kind, name, enabled)"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, skipped: false, error: error?.message || "Event not found" };
  }

  const event = data as unknown as EventWithTerm;
  const term = Array.isArray(event.nrcs_event_classification_terms)
    ? event.nrcs_event_classification_terms[0] || null
    : event.nrcs_event_classification_terms || null;
  return syncEventToCms({
    id: event.id,
    district_key: event.district_key,
    title: event.title,
    body_html: event.body_html,
    location_name: event.location_name,
    address: event.address,
    city: event.city,
    state: event.state,
    zip: event.zip,
    location: event.location,
    start_at: event.start_at,
    end_at: event.end_at,
    image_url: event.image_url,
    status: event.status,
    classification: term
      ? {
          kind: term.kind,
          name: term.name,
          enabled: term.enabled,
        }
      : null,
  });
}
