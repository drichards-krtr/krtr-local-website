import { createHash } from "node:crypto";
import { sanitizeRichTextHtml } from "./richText";
import { getNrcsCmsApiEnv } from "./env";
import { getMuxAsset, getMuxCredentials } from "./mux";

export const MIGRATION_KINDS = ["tags", "terms", "stories", "events", "slots"] as const;
export type MigrationKind = typeof MIGRATION_KINDS[number];
export type LegacyRow = Record<string, any>;
export const MIGRATION_FALLBACK_AUTHOR_EMAIL = "drichards@krtrlocal.tv";
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function migrationHash(value: unknown) { return createHash("sha256").update(stableJson(value)).digest("hex"); }
export function migrationUuid(kind: string, sourceId: string) {
  const hex = migrationHash(["krtr-cms-migration-v1", kind, sourceId]).slice(0, 32).split("");
  hex[12] = "5"; hex[16] = "8";
  const id = hex.join("");
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}
export function utcTimestamp(value: unknown): string | null {
  if (!value) return null;
  const input = String(value);
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/i.test(input)) throw new Error(`Invalid timestamp: ${input}`);
  // Legacy editorial ISO timestamps were stored without a zone; preserve UTC instants.
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(input) ? input : `${input.replace(" ", "T")}Z`;
  const date = new Date(zoned);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid timestamp: ${input}`);
  const datePart = input.slice(0, 10);
  if (new Date(`${datePart}T00:00:00Z`).toISOString().slice(0, 10) !== datePart) throw new Error(`Invalid calendar date: ${input}`);
  // Keep source sub-millisecond precision; PostgreSQL performs the instant conversion.
  return zoned.replace(" ", "T");
}
function escapeHtml(value: unknown) { return String(value || "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!)); }
export function normalizeLegacy(kind: MigrationKind, row: LegacyRow, owner: string | null, now = new Date(), timezone = "America/Chicago", mapping: LegacyRow = {}, fallbackOwner: string | null = null) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const id = String(kind === "slots" ? row.slot : kind === "tags" ? row.slug : row.id);
  const targetId = kind === "events" && row.nrcs_source_id ? String(row.nrcs_source_id) : migrationUuid(kind, `${row.district_key}:${id}`);
  const normalized: LegacyRow = { ...row, source_id: id, target_id: targetId, owner_id: Object.hasOwn(mapping, "owner_id") ? mapping.owner_id : owner, classification_target_id: mapping.classification_target_id || null, mapping };
  if (["stories", "events"].includes(kind) && !normalized.owner_id && fallbackOwner) {
    normalized.owner_id = fallbackOwner;
    mapping = { ...mapping, owner_id: fallbackOwner, fallback_author_email: MIGRATION_FALLBACK_AUTHOR_EMAIL };
    warnings.push(`Unassigned author mapped to ${MIGRATION_FALLBACK_AUTHOR_EMAIL}; original author provenance retained.`);
  }
  const tagMappings = mapping.tags || {};
  const relevantSlugs = kind === "tags" ? [id] : kind === "stories" ? (row.tag_definitions || []).map((definition: LegacyRow) => definition.slug) : [];
  normalized.mapping = { ...mapping, tags: Object.fromEntries(Object.entries(tagMappings).filter(([slug]) => relevantSlugs.includes(slug))) };
  if (kind === "tags" && tagMappings[id]) {
    normalized.name = tagMappings[id].name;
    normalized.target_id = tagMappings[id].id;
  }
  if (kind === "stories") {
    const definitions = (row.tag_definitions || []).map((definition: LegacyRow) => tagMappings[definition.slug] ? { ...definition, legacy_slug: definition.slug, slug: tagMappings[definition.slug].slug, name: tagMappings[definition.slug].name } : definition);
    normalized.tag_definitions = [...new Map(definitions.map((definition: LegacyRow) => [definition.slug, definition])).values()];
  }
  if (!["slots", "tags"].includes(kind) && !/^[0-9a-f-]{36}$/i.test(id)) errors.push("Invalid source UUID.");
  if (["stories", "events"].includes(kind)) {
    errors.push(...(row.relationship_issues || []));
    if (!String(row.title || "").trim()) errors.push("Title is required.");
    if (!["draft", "published", "archived"].includes(row.status)) errors.push("Unknown source status.");
    if (row.created_by && !normalized.owner_id) warnings.push("Author unmatched; owner remains unassigned.");
    if (row.image_url && !/^https?:\/\//i.test(row.image_url)) errors.push("Invalid image URL.");
    if (row.image_public_id && !row.image_url) errors.push("Image identity has no image URL.");
    normalized.submitters = (row.submitters || []).map((contact: LegacyRow) => {
      try { return { ...contact, created_at: utcTimestamp(contact.created_at) }; }
      catch { errors.push("Submitter creation timestamp needs review."); return contact; }
    });
    for (const field of ["created_at", "updated_at"]) {
      try { normalized[field] = utcTimestamp(row[field]); if (!normalized[field]) errors.push(`Missing ${field}.`); }
      catch (error) { errors.push(String(error)); }
    }
  }
  if (kind === "stories") {
    errors.push(...(row.conversion_issues || []));
    normalized.body_html = sanitizeRichTextHtml(row.body_html || row.converted_html || "");
    try { normalized.published_at = utcTimestamp(row.published_at); } catch (error) { errors.push(String(error)); }
    const scheduled = row.status === "published" && normalized.published_at && new Date(normalized.published_at) > now;
    normalized.lifecycle_state = row.status === "draft" ? "reporting" : row.status === "archived" ? "closed" : scheduled ? "ready" : "active";
    normalized.output_status = row.status === "draft" ? "draft" : row.status === "archived" ? "unpublished" : scheduled ? "scheduled" : "published";
    normalized.slug = row.slug || row.id;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized.slug)) errors.push("Slug cannot be represented without changing the public route.");
    if (row.status === "published" && !normalized.published_at) errors.push("Published Story has no publication date; review required.");
    if (row.mux_asset_id && (row.mux_status !== "ready" || !row.mux_playback_id)) errors.push("Story video is not ready or missing playback identity.");
    if (row.mux_playback_id && !row.mux_asset_id) errors.push("Video playback reference has no Mux asset identity.");
    if (row.mux_upload_id && !row.mux_asset_id) errors.push("Video upload has no completed Mux asset identity.");
    if (row.mux_asset_id) warnings.push("Legacy video uploader cannot be proven from Story authorship; video ownership remains unassigned.");
    if (row.editorial_origin === "nrcs") errors.push("NRCS-origin Story requires explicit reconciliation; not a legacy import.");
  }
  if (kind === "events") {
    let html = row.body_html || `<p>${escapeHtml(row.description).replace(/\n/g, "<br>")}</p>`;
    for (const number of [1, 2]) if (row[`link_${number}_url`]) html += `<p><a href="${escapeHtml(row[`link_${number}_url`])}">${escapeHtml(row[`link_${number}_text`] || row[`link_${number}_url`])}</a></p>`;
    normalized.body_html = sanitizeRichTextHtml(html);
    for (const field of ["start_at", "end_at"]) {
      if (!row[field]) { if (field === "start_at") errors.push("Event start time is missing."); continue; }
      const value = String(row[field]);
      const parsed = new Date(value.replace(" ", "T") + "Z");
      if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 16) !== value.replace(" ", "T").slice(0, 16)) errors.push(`Invalid naive ${field}; review required.`);
    }
    if (row.end_at && String(row.end_at).replace(" ", "T") < String(row.start_at).replace(" ", "T")) errors.push("Event ends before it starts.");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    if (row.is_school_sports && !row.classification && !normalized.classification_target_id && String(row.end_at || row.start_at).slice(0, 10) >= today) errors.push("Upcoming school sports event needs staff sport classification.");
    if (row.is_school_sports && !row.classification) warnings.push("Legacy school-sports flag retained in provenance.");
  }
  if (kind === "terms" && (!["sport", "extra_curricular", "event_type"].includes(row.kind) || !String(row.name || "").trim())) errors.push("Invalid classification term.");
  if (kind === "tags" && (!/^[a-z0-9][a-z0-9-]*$/.test(row.slug || "") || !String(row.name || "").trim())) errors.push("Invalid canonical Tag.");
  if (kind === "slots" && (!Array.isArray(row.slots) || row.slots.some((slot: LegacyRow) => !["hero", "top1", "top2", "top3", "top4"].includes(slot.slot)))) errors.push("Unknown Homepage placement.");
  return { normalized, errors, warnings };
}
export async function fetchLegacy(kind: MigrationKind, district: string, after?: string | null, id?: string) {
  const env = getNrcsCmsApiEnv();
  if (!env) throw new Error("CMS API environment is not configured.");
  const url = new URL(`${env.baseUrl}/api/nrcs/migration-export`);
  url.searchParams.set("kind", kind); url.searchParams.set("district", district);
  if (after) url.searchParams.set("after", after);
  if (id) url.searchParams.set("id", id);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${env.secret}` }, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(15000) });
  if (response.status >= 300 && response.status < 400) throw new Error("Migration export redirected; use the canonical CMS API host.");
  if (!response.ok) throw new Error(`CMS export ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const result = await response.json();
  if (result.schema_version !== 1 || result.kind !== kind || result.district_key !== district || !Array.isArray(result.rows) || result.rows.length > 10 || result.rows.some((row: LegacyRow) => row.district_key !== district)) throw new Error("CMS migration export identity mismatch.");
  return result as { rows: LegacyRow[]; next: string | null; remaining: number; audit: Record<string, number> | null };
}

export async function verifyLegacyMedia(row: LegacyRow) {
  const errors: string[] = [];
  if (row.image_url) {
    try {
      const url = new URL(row.image_url);
      if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || url.username || url.password || url.port) throw new Error("Image is outside the Cloudinary host; manual media review required.");
      const response = await fetch(url, { method: "HEAD", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error(`Cloudinary image unavailable (${response.status}).`);
    } catch (error) { errors.push(error instanceof Error ? error.message : "Image verification failed."); }
  }
  if (row.mux_asset_id) {
    try {
      if (!getMuxCredentials()) throw new Error("Mux credentials missing; cannot verify legacy video.");
      const asset = await getMuxAsset(row.mux_asset_id);
      if (!asset || asset.status !== "ready" || !asset.playback_ids?.some(playback => playback.id === row.mux_playback_id)) throw new Error("Mux asset/playback identity is missing or not ready.");
    } catch (error) { errors.push(error instanceof Error ? error.message : "Video verification failed."); }
  }
  return errors;
}
