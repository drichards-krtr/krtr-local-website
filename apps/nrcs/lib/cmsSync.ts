import { getNrcsCmsApiEnv } from "./env";
import type { EventClassificationKind } from "./eventClassifications";

type SyncEventPayload = {
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
  classification: {
    kind: EventClassificationKind;
    name: string;
    enabled: boolean;
  } | null;
};

export async function syncEventToCms(payload: SyncEventPayload) {
  const env = getNrcsCmsApiEnv();
  if (!env) {
    return {
      ok: false,
      skipped: true,
      error: "CMS sync env vars are missing or NRCS_CMS_API_BASE_URL does not start with http:// or https://.",
    };
  }

  let response: Response;
  try {
    response = await fetch(`${env.baseUrl}/api/nrcs/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      error: error instanceof Error ? error.message : "CMS sync request failed.",
    };
  }

  if (!response.ok) {
    return { ok: false, skipped: false, error: await response.text() };
  }

  return { ok: true, skipped: false, error: null };
}
