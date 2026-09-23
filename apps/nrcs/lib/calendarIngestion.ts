import { createHash, timingSafeEqual } from "node:crypto";
import { sanitizeEventHtml } from "./richText";

export const CALENDAR_ADAPTERS = ["bound", "ical", "rss", "google_calendar", "generic_web", "browser_web", "facebook_events", "facebook_posts", "facebook_explore"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELD_NAMES = ["title", "body_html", "location_name", "address", "city", "state", "zip", "start_at", "end_at"] as const;

export function integrationAuthorized(request: Request) {
  const expected = process.env.NRCS_CALENDAR_INGEST_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  return Boolean(expected && expected.length >= 32 && Buffer.byteLength(expected) === Buffer.byteLength(supplied)
    && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)));
}

export async function readLimitedJson(request: Request, maxBytes = 1_000_000): Promise<unknown> {
  if (!request.body) throw new Error("Request body required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error("Payload exceeds size limit."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > max) throw new Error("Invalid or oversized text field.");
  return value.trim() || null;
}
function naiveDate(value: unknown) {
  const s = text(value, 19);
  if (!s) return null;
  // Phase A contract uses district-local wall times, matching existing canonical Events.
  // Reject offsets rather than silently dropping them during a timestamp cast.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)
    || !Number.isFinite(Date.parse(s + "Z"))
    || new Date(s + "Z").toISOString().slice(0, s.length) !== s) throw new Error("Event dates must be valid district-local YYYY-MM-DDTHH:mm[:ss] values.");
  return s;
}
export function hashJson(value: unknown): string {
  function stable(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, stable(x)]));
    return v;
  }
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export function validateCalendarRun(value: unknown) {
  const r = record(value);
  const allowed = ["run_id", "source_id", "status", "inventory_complete", "window_start", "window_end", "error_message", "candidates"];
  if (Object.keys(r).some(k => !allowed.includes(k))) throw new Error("Unknown run field.");
  if (typeof r.run_id !== "string" || !UUID.test(r.run_id) || typeof r.source_id !== "string" || !UUID.test(r.source_id)) throw new Error("Valid run_id and source_id UUIDs required.");
  if (!["success", "partial", "failed"].includes(String(r.status)) || typeof r.inventory_complete !== "boolean") throw new Error("Invalid run status or inventory_complete.");
  if (r.inventory_complete && r.status !== "success") throw new Error("Only successful runs can have complete inventories.");
  const start = text(r.window_start, 40), end = text(r.window_end, 40);
  if (!start || !end || !/(Z|[+-]\d{2}:\d{2})$/.test(start) || !/(Z|[+-]\d{2}:\d{2})$/.test(end)
    || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start)
    || Date.parse(end) - Date.parse(start) > 90 * 86400000) throw new Error("Provide an explicit scan window of at most 90 days with UTC offsets.");
  if (!Array.isArray(r.candidates) || r.candidates.length > 500) throw new Error("A run accepts at most 500 candidates; capped inventories must be partial.");
  if (r.status === "failed" && r.candidates.length) throw new Error("Failed runs cannot submit candidates.");
  const ids = new Set<string>();
  const candidates = r.candidates.map(input => {
    const c = record(input);
    if (Object.keys(c).some(k => !["external_event_id", "fields", "source_excerpt", "raw_payload"].includes(k))) throw new Error("Unknown candidate field.");
    const id = text(c.external_event_id, 1000);
    if (!id || ids.has(id)) throw new Error("Each occurrence needs a unique, stable external_event_id within the run.");
    ids.add(id);
    const f = record(c.fields);
    if (Object.keys(f).some(k => !FIELD_NAMES.includes(k as typeof FIELD_NAMES[number]))) throw new Error("Unsupported event field. Publication state cannot be supplied.");
    const fields = Object.fromEntries(FIELD_NAMES.map(k => [k, k === "start_at" || k === "end_at" ? naiveDate(f[k]) : text(f[k], k === "body_html" ? 30000 : 1000)]));
    fields.body_html = fields.body_html ? sanitizeEventHtml(fields.body_html) || null : null;
    if (fields.start_at && fields.end_at && fields.end_at < fields.start_at) throw new Error("End time precedes start time.");
    const raw = c.raw_payload == null ? {} : record(c.raw_payload);
    if (JSON.stringify(raw).length > 30000) throw new Error("Raw evidence exceeds size limit.");
    return { external_event_id: id, fields, evidence_hash: hashJson(fields), source_excerpt: text(c.source_excerpt, 10000), raw_payload: raw };
  });
  return { run_id: r.run_id, source_id: r.source_id, status: r.status as string, inventory_complete: r.inventory_complete,
    window_start: new Date(start).toISOString(), window_end: new Date(end).toISOString(), error_message: text(r.error_message, 2000), candidates };
}
