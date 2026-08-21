export type EventAddress = {
  location_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  location?: string | null;
};

export function normalizeTown(value: string | null | undefined) {
  return (value || "").trim().replace(/\s+/g, " ");
}

export function getEventTown(event: Pick<EventAddress, "city">) {
  return normalizeTown(event.city);
}

export function formatEventLocation(event: EventAddress) {
  const addressLine = [event.address, event.city, event.state, event.zip]
    .map((value) => (value || "").trim())
    .filter(Boolean)
    .join(", ");
  const lines = [(event.location_name || "").trim(), addressLine].filter(Boolean);

  if (lines.length > 0) return lines;
  return event.location ? [event.location] : [];
}

export function getRequiredEventAddress(formData: FormData) {
  const locationName = String(formData.get("location_name") || "").trim();
  const address = String(formData.get("address") || "").trim();
  const city = normalizeTown(String(formData.get("city") || ""));
  const state = String(formData.get("state") || "").trim().toUpperCase();
  const zip = String(formData.get("zip") || "").trim();

  if (!locationName || !address || !city || !state || !zip) {
    return {
      error: "Location name, address, city, state, and zip are required.",
      addressFields: null,
    };
  }

  return {
    error: null,
    addressFields: {
      location_name: locationName,
      address,
      city,
      state,
      zip,
      location: `${locationName}, ${address}, ${city}, ${state} ${zip}`,
    },
  };
}
