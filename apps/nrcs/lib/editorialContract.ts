export type ImageReference = { id: string; title: string; asset_type: "image" | "graphic"; url: string; public_id: string | null };
export type VideoReference = { id: string; title: string; asset_type: "video"; playback_id: string; mux_asset_id: string | null; thumbnail_url: string | null; orientation: "vertical" | "horizontal" };
export type WebPackage = { story_id: string; copy_version_id: string | null; title: string; body_html: string; tease: string | null; slug: string | null; status: "draft" | "scheduled" | "published" | "unpublished"; scheduled_at: string | null; published_at: string | null; seo_title: string | null; seo_description: string | null; category: { id: string; name: string; slug: string } | null; tags: Array<{ id: string; name: string; slug: string; tag_type: string }>; hero: ImageReference | null; article_media: ImageReference[]; video: VideoReference | null };
export type HomepagePackage = { timezone: string; hero_output_id: string | null; top_output_ids: string[]; daily: { edition_id: string; title: string; program_id: string; program_name: string; publication_date: string; asset: ImageReference | VideoReference } | null };
export type AlertPackage = { headline: string; message: string; active: boolean; start_at: string | null; end_at: string | null; target_type: "none" | "story" | "event" | "external"; target_id: string | null; external_url: string | null };
export type PublicationKind = "web" | "homepage" | "alert";
export type PublicationEnvelope = { schema_version: 1; request_id: string; district_key: string; source_id: string; revision: number } & ({ kind: "web"; payload: WebPackage } | { kind: "homepage"; payload: HomepagePackage } | { kind: "alert"; payload: AlertPackage });
export type PublicationReceipt = { schema_version: 1; request_id: string; kind: PublicationKind; source_id: string; district_key: string; revision: number; content_hash: string; state: "received_non_public"; cms_projection_id: string; cms_article_id: null; public_url: null; published_at: null; received_at: string; current_projection_revision: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object.");
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`Unsupported package field: ${key}`);
  return value as Record<string, unknown>;
}
function string(value: unknown, max: number, required = false): string {
  if (typeof value !== "string" || value.length > max || required && !value.trim()) throw new Error("Invalid package text.");
  return value;
}
function optional(value: unknown, max: number) { return value === null ? null : string(value, max); }
function id(value: unknown): string { const result = string(value, 36); if (!UUID.test(result)) throw new Error("Invalid package ID."); return result; }
function optionalId(value: unknown) { return value === null ? null : id(value); }
function array(value: unknown, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) throw new Error("Invalid package list."); return value; }
function url(value: unknown): string { const result = string(value, 2000, true); const parsed = new URL(result); if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("Invalid package URL."); return result; }
function time(value: unknown): string | null { if (value === null) return null; const result = string(value, 40); if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(result) || !Number.isFinite(Date.parse(result))) throw new Error("Package timestamps require an explicit timezone."); return result; }
function choice<T extends string>(value: unknown, choices: readonly T[]): T { if (!choices.includes(value as T)) throw new Error("Invalid package option."); return value as T; }
function image(value: unknown): ImageReference {
  const a = object(value, ["id", "title", "asset_type", "url", "public_id"]);
  return { id: id(a.id), title: string(a.title, 1000, true), asset_type: choice(a.asset_type, ["image", "graphic"]), url: url(a.url), public_id: optional(a.public_id, 1000) };
}
function video(value: unknown): VideoReference {
  const a = object(value, ["id", "title", "asset_type", "playback_id", "mux_asset_id", "thumbnail_url", "orientation"]);
  const playback = string(a.playback_id, 256, true); if (!/^[a-zA-Z0-9]+$/.test(playback)) throw new Error("Invalid Mux playback ID.");
  return { id: id(a.id), title: string(a.title, 1000, true), asset_type: choice(a.asset_type, ["video"]), playback_id: playback, mux_asset_id: optional(a.mux_asset_id, 256), thumbnail_url: a.thumbnail_url === null ? null : url(a.thumbnail_url), orientation: choice(a.orientation, ["vertical", "horizontal"]) };
}
export function validatePublication(value: unknown): PublicationEnvelope {
  const e = object(value, ["schema_version", "request_id", "district_key", "source_id", "revision", "kind", "payload"]);
  if (e.schema_version !== 1 || !Number.isSafeInteger(e.revision) || Number(e.revision) < 1) throw new Error("Unsupported schema or invalid revision.");
  const district = string(e.district_key, 100, true); if (!/^[a-z0-9][a-z0-9-]*$/.test(district)) throw new Error("Invalid district key.");
  const kind = choice(e.kind, ["web", "homepage", "alert"]);
  const source = kind === "homepage" ? string(e.source_id, 100) : id(e.source_id);
  if (kind === "homepage" && source !== district) throw new Error("Homepage identity must match district.");
  const base = { schema_version: 1 as const, request_id: id(e.request_id), district_key: district, source_id: source, revision: Number(e.revision) };
  if (kind === "web") {
    const p = object(e.payload, ["story_id", "copy_version_id", "title", "body_html", "tease", "slug", "status", "scheduled_at", "published_at", "seo_title", "seo_description", "category", "tags", "hero", "article_media", "video"]);
    const category = p.category === null ? null : object(p.category, ["id", "name", "slug"]);
    const payload: WebPackage = { story_id: id(p.story_id), copy_version_id: optionalId(p.copy_version_id), title: string(p.title, 1000, true), body_html: string(p.body_html, 500000), tease: optional(p.tease, 1000), slug: optional(p.slug, 240), status: choice(p.status, ["draft", "scheduled", "published", "unpublished"]), scheduled_at: time(p.scheduled_at), published_at: time(p.published_at), seo_title: optional(p.seo_title, 240), seo_description: optional(p.seo_description, 1000), category: category ? { id: id(category.id), name: string(category.name, 240, true), slug: string(category.slug, 240, true) } : null, tags: array(p.tags, 200).map(value => { const t = object(value, ["id", "name", "slug", "tag_type"]); return { id: id(t.id), name: string(t.name, 240, true), slug: string(t.slug, 240, true), tag_type: choice(t.tag_type, ["place", "organization", "person", "topic", "event_series", "other"]) }; }), hero: p.hero === null ? null : image(p.hero), article_media: array(p.article_media, 100).map(image), video: p.video === null ? null : video(p.video) };
    if (payload.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(payload.slug)) throw new Error("Invalid publication slug.");
    if (payload.status !== "draft" && !payload.copy_version_id || ["scheduled", "published"].includes(payload.status) && !payload.slug || payload.status === "scheduled" && !payload.scheduled_at || payload.status === "published" && !payload.published_at) throw new Error("Incomplete publication instructions.");
    if (new Set(payload.article_media.map(a => a.id)).size !== payload.article_media.length || new Set(payload.tags.map(t => t.id)).size !== payload.tags.length) throw new Error("Duplicate package references.");
    const heroIndex = payload.article_media.findIndex(a => a.id === payload.hero?.id); if (heroIndex > 0) throw new Error("Included Hero must be first.");
    return { ...base, kind, payload };
  }
  if (kind === "homepage") {
    const p = object(e.payload, ["timezone", "hero_output_id", "top_output_ids", "daily"]);
    const timezone = string(p.timezone, 100); new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    const top = array(p.top_output_ids, 4).map(id); if (new Set(top).size !== top.length) throw new Error("Duplicate Top Four selection.");
    const daily = p.daily === null ? null : object(p.daily, ["edition_id", "title", "program_id", "program_name", "publication_date", "asset"]);
    let parsedDaily: HomepagePackage["daily"] = null;
    if (daily) {
      const date = string(daily.publication_date, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date) throw new Error("Invalid Daily date.");
      const asset = daily.asset as Record<string, unknown>;
      parsedDaily = { edition_id: id(daily.edition_id), title: string(daily.title, 1000, true), program_id: id(daily.program_id), program_name: string(daily.program_name, 240, true), publication_date: date, asset: asset?.asset_type === "video" ? video(asset) : image(asset) };
    }
    return { ...base, kind, payload: { timezone, hero_output_id: optionalId(p.hero_output_id), top_output_ids: top, daily: parsedDaily } };
  }
  const p = object(e.payload, ["headline", "message", "active", "start_at", "end_at", "target_type", "target_id", "external_url"]);
  if (typeof p.active !== "boolean") throw new Error("Invalid alert enabled state.");
  const payload: AlertPackage = { headline: string(p.headline, 240, true), message: string(p.message, 4000), active: p.active, start_at: time(p.start_at), end_at: time(p.end_at), target_type: choice(p.target_type, ["none", "story", "event", "external"]), target_id: optionalId(p.target_id), external_url: p.external_url === null ? null : url(p.external_url) };
  if (payload.start_at && payload.end_at && Date.parse(payload.end_at) <= Date.parse(payload.start_at)) throw new Error("Invalid alert interval.");
  if (payload.target_type === "none" && (payload.target_id || payload.external_url) || ["story", "event"].includes(payload.target_type) && (!payload.target_id || payload.external_url) || payload.target_type === "external" && (!payload.external_url || payload.target_id)) throw new Error("Invalid alert target.");
  return { ...base, kind, payload };
}
export function canonicalPublication(envelope: PublicationEnvelope) {
  const { request_id: _request, ...content } = envelope;
  function sorted(value: unknown): unknown { return Array.isArray(value) ? value.map(sorted) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, sorted(entry)])) : value; }
  return JSON.stringify(sorted(content));
}
export function verifyPublicationReceipt(value: unknown, envelope: PublicationEnvelope, hash: string): PublicationReceipt {
  const r = value as PublicationReceipt;
  if (!r || r.schema_version !== 1 || r.request_id !== envelope.request_id || r.kind !== envelope.kind || r.source_id !== envelope.source_id || r.district_key !== envelope.district_key || r.revision !== envelope.revision || r.content_hash !== hash || r.state !== "received_non_public" || !UUID.test(r.cms_projection_id) || r.cms_article_id !== null || r.public_url !== null || r.published_at !== null || !Number.isFinite(Date.parse(r.received_at)) || !Number.isSafeInteger(r.current_projection_revision) || r.current_projection_revision < r.revision) throw new Error("CMS returned an invalid or mismatched receipt. Delivery is unconfirmed.");
  return r;
}
