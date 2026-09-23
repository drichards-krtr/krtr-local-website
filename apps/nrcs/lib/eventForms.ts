import { sanitizeEventHtml } from "./richText";

export function getEventAddressFields(formData: FormData, required = true) {
  const locationName = String(formData.get("location_name") || "").trim();
  const address = String(formData.get("address") || "").trim();
  const city = String(formData.get("city") || "").trim().replace(/\s+/g, " ");
  const state = String(formData.get("state") || "").trim().toUpperCase();
  const zip = String(formData.get("zip") || "").trim();

  if (required && (!locationName || !address || !city || !state || !zip)) {
    return { error: "Location name, address, city, state, and zip are required.", fields: null };
  }

  return {
    error: null,
    fields: {
      location_name: locationName || null,
      address: address || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      location: [locationName, address, city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
    },
  };
}

export function getEventPayloadFromForm(formData: FormData, fallbackDistrictKey: string) {
  const title = String(formData.get("title") || "").trim();
  const startAt = String(formData.get("start_at") || "").trim();
  const status = String(formData.get("status") || "draft");
  if (!["draft", "published", "archived"].includes(status)) return { error: "Invalid Event status.", payload: null };
  const { error, fields } = getEventAddressFields(formData, status === "published");

  if (status === "published" && (!title || !startAt)) {
    return { error: "Title and start time are required for publication.", payload: null };
  }

  if (error || !fields) {
    return { error: error || "Event address is required.", payload: null };
  }

  return {
    error: null,
    payload: {
      district_key: String(formData.get("district_key") || fallbackDistrictKey).trim().toLowerCase(),
      title: title || null,
      body_html: sanitizeEventHtml(String(formData.get("body_html") || "")) || null,
      ...fields,
      start_at: startAt || null,
      end_at: String(formData.get("end_at") || "").trim() || null,
      image_url: String(formData.get("image_url") || "").trim() || null,
      status,
      classification_term_id: String(formData.get("classification_term_id") || "").trim() || null,
    },
  };
}
