import { sanitizeEventHtml } from "./richText";

export function getEventAddressFields(formData: FormData) {
  const locationName = String(formData.get("location_name") || "").trim();
  const address = String(formData.get("address") || "").trim();
  const city = String(formData.get("city") || "").trim().replace(/\s+/g, " ");
  const state = String(formData.get("state") || "").trim().toUpperCase();
  const zip = String(formData.get("zip") || "").trim();

  if (!locationName || !address || !city || !state || !zip) {
    return { error: "Location name, address, city, state, and zip are required.", fields: null };
  }

  return {
    error: null,
    fields: {
      location_name: locationName,
      address,
      city,
      state,
      zip,
      location: `${locationName}, ${address}, ${city}, ${state} ${zip}`,
    },
  };
}

export function getEventPayloadFromForm(formData: FormData, fallbackDistrictKey: string) {
  const title = String(formData.get("title") || "").trim();
  const startAt = String(formData.get("start_at") || "").trim();
  const { error, fields } = getEventAddressFields(formData);

  if (!title || !startAt) {
    return { error: "Title and start time are required.", payload: null };
  }

  if (error || !fields) {
    return { error: error || "Event address is required.", payload: null };
  }

  return {
    error: null,
    payload: {
      district_key: String(formData.get("district_key") || fallbackDistrictKey).trim().toLowerCase(),
      title,
      body_html: sanitizeEventHtml(String(formData.get("body_html") || "")) || null,
      ...fields,
      start_at: startAt,
      end_at: String(formData.get("end_at") || "").trim() || null,
      image_url: String(formData.get("image_url") || "").trim() || null,
      status: String(formData.get("status") || "draft"),
      classification_term_id: String(formData.get("classification_term_id") || "").trim() || null,
    },
  };
}
