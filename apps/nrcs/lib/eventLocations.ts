import { createNrcsServerClient } from "./server";

export async function resolveEventLocation(payload: {
  district_key: string;
  location_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}) {
  if (!payload.location_name || !payload.address || !payload.city || !payload.state || !payload.zip) {
    return { locationId: null, error: null };
  }
  const supabase = await createNrcsServerClient();
  const { data, error } = await supabase.rpc("nrcs_resolve_event_location", {
    p_district_key: payload.district_key,
    p_name: payload.location_name,
    p_address: payload.address,
    p_city: payload.city,
    p_state: payload.state,
    p_zip: payload.zip,
  });
  return { locationId: data as string | null, error: error?.message || null };
}
