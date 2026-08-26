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

export type CmsSyncResult =
  | {
      ok: true;
      skipped: false;
      error: null;
      cmsEventId: string | null;
      cmsSupabaseHost: string | null;
      cmsStatus: string | null;
      nrcsSourceId: string | null;
      cmsApiUrl: string;
      cmsTable: string | null;
    }
  | {
      ok: false;
      skipped: boolean;
      error: string;
      cmsEventId?: null;
      cmsSupabaseHost?: null;
      cmsStatus?: null;
      nrcsSourceId?: null;
      cmsApiUrl?: string | null;
      cmsTable?: null;
    };

export async function syncEventToCms(payload: SyncEventPayload) {
  const env = getNrcsCmsApiEnv();
  if (!env) {
    return {
      ok: false,
      skipped: true,
      error: "CMS sync env vars are missing or NRCS_CMS_API_BASE_URL does not start with http:// or https://.",
    } satisfies CmsSyncResult;
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
      redirect: "manual",
    });
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      error: error instanceof Error ? error.message : "CMS sync request failed.",
    } satisfies CmsSyncResult;
  }

  if (response.status >= 300 && response.status < 400) {
    return {
      ok: false,
      skipped: false,
      error: `CMS sync endpoint redirected to ${response.headers.get("location") || "another URL"}. Set NRCS_CMS_API_BASE_URL to the canonical CMS host so the Authorization header is not lost.`,
    } satisfies CmsSyncResult;
  }

  if (!response.ok) {
    return { ok: false, skipped: false, error: await response.text() } satisfies CmsSyncResult;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      skipped: false,
      error: `CMS sync endpoint returned ${contentType || "non-JSON"} instead of JSON. Check NRCS_CMS_API_BASE_URL. Response preview: ${body.slice(0, 200)}`,
    } satisfies CmsSyncResult;
  }

  let responseData: {
    ok?: unknown;
    cms_event_id?: unknown;
    event_id?: unknown;
    cms_supabase_host?: unknown;
    status?: unknown;
    nrcs_source_id?: unknown;
    table?: unknown;
  } = {};

  try {
    responseData = (await response.json()) as typeof responseData;
  } catch {
    responseData = {};
  }

  if (responseData.ok !== true) {
    return {
      ok: false,
      skipped: false,
      error: "CMS sync endpoint returned JSON, but did not confirm ok: true. Check NRCS_CMS_API_BASE_URL.",
    } satisfies CmsSyncResult;
  }

  const cmsEventId =
    typeof responseData.cms_event_id === "string"
      ? responseData.cms_event_id
      : typeof responseData.event_id === "string"
        ? responseData.event_id
        : null;
  const cmsTable = typeof responseData.table === "string" ? responseData.table : null;
  const cmsApiUrl = `${env.baseUrl}/api/nrcs/events`;

  if (cmsTable !== "events" || !cmsEventId) {
    return {
      ok: false,
      skipped: false,
      error: `CMS sync endpoint returned ok:true, but did not confirm an events-table write. CMS API URL: ${cmsApiUrl}. Table: ${cmsTable || "missing"}. CMS Event ID: ${cmsEventId || "missing"}.`,
    } satisfies CmsSyncResult;
  }

  return {
    ok: true,
    skipped: false,
    error: null,
    cmsEventId,
    cmsSupabaseHost:
      typeof responseData.cms_supabase_host === "string" ? responseData.cms_supabase_host : null,
    cmsStatus: typeof responseData.status === "string" ? responseData.status : null,
    nrcsSourceId: typeof responseData.nrcs_source_id === "string" ? responseData.nrcs_source_id : null,
    cmsApiUrl,
    cmsTable,
  } satisfies CmsSyncResult;
}
