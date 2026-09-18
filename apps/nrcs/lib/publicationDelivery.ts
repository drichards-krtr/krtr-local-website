import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { canonicalPublication, validatePublication, verifyPublicationReceipt, type ImageReference, type VideoReference, type PublicationEnvelope, type PublicationKind, type PublicationReceipt } from "./editorialContract";
import { createNrcsServerClient, createNrcsServiceClient } from "./server";
import { getNrcsDistrictContext } from "./districts";
import { getNrcsCmsApiEnv } from "./env";
import { sanitizeRichTextHtml } from "./richText";

type Asset = { id: string; title: string; asset_type: string; cloudinary_url: string | null; cloudinary_public_id: string | null; mux_status: string | null; mux_playback_id: string | null; mux_asset_id: string | null; thumbnail_url: string | null; metadata: Record<string, unknown> };
export type DeliverySummary = { request_id: string; kind: PublicationKind; source_id: string; revision: number; district_key: string; status: string; attempts: number; lease_until: string | null; last_error: string | null; receipt: PublicationReceipt | null; updated_at: string };
type Delivery = DeliverySummary & { package: PublicationEnvelope; content_hash: string };
const assetSelect = "id,title,asset_type,cloudinary_url,cloudinary_public_id,mux_status,mux_playback_id,mux_asset_id,thumbnail_url,metadata";
function media(asset: Asset): ImageReference | VideoReference {
  if (asset.asset_type === "video") {
    if (asset.mux_status !== "ready" || !asset.mux_playback_id) throw new Error("Selected video is not ready. Update the output before sending.");
    return { id: asset.id, title: asset.title, asset_type: "video", playback_id: asset.mux_playback_id, mux_asset_id: asset.mux_asset_id, thumbnail_url: asset.thumbnail_url, orientation: asset.metadata?.video_orientation === "vertical" ? "vertical" : "horizontal" };
  }
  if (!["image", "graphic"].includes(asset.asset_type) || !asset.cloudinary_url) throw new Error("Selected image is unavailable.");
  return { id: asset.id, title: asset.title, asset_type: asset.asset_type as "image" | "graphic", url: asset.cloudinary_url, public_id: asset.cloudinary_public_id };
}
export async function buildPublication(kind: PublicationKind, sourceId: string, districtKey: string, revision: number): Promise<PublicationEnvelope> {
  const supabase = await createNrcsServerClient();
  const context = await getNrcsDistrictContext();
  const district = context.allowedDistricts.find(d => d.district_key === districtKey);
  if (!district) throw new Error("District is not accessible.");
  const table = kind === "web" ? "nrcs_web_outputs" : kind === "homepage" ? "nrcs_homepage_lineups" : "nrcs_priority_alerts";
  const { data: source, error } = await supabase.from(table).select("*").eq(kind === "homepage" ? "district_key" : "id", sourceId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!source || source.district_key !== districtKey || source.revision !== revision) throw new Error("Source changed or is not accessible. Save/reload before sending.");
  const base = { schema_version: 1, request_id: randomUUID(), kind, source_id: sourceId, district_key: districtKey, revision };
  if (kind === "alert") return validatePublication({ ...base, payload: { headline: source.headline, message: source.message, active: source.active, start_at: source.start_at, end_at: source.end_at, target_type: source.target_type, target_id: source.target_id, external_url: source.external_url } });
  if (kind === "homepage") {
    let daily = null;
    if (source.daily_edition_id) {
      const { data: edition, error: editionError } = await supabase.from("nrcs_editions").select("id,title,program_id,district_key,nrcs_programs(name)").eq("id", source.daily_edition_id).single();
      const { data: asset, error: assetError } = await supabase.from("nrcs_assets").select(assetSelect).eq("id", source.daily_asset_id).single();
      if (editionError || assetError || !edition || edition.district_key !== districtKey || !asset) throw new Error("Daily Edition/media is unavailable. Update the lineup before sending.");
      const program = Array.isArray(edition.nrcs_programs) ? edition.nrcs_programs[0] : edition.nrcs_programs;
      daily = { edition_id: edition.id, title: edition.title, program_id: edition.program_id, program_name: program?.name || "", publication_date: source.daily_publication_date, asset: media(asset as Asset) };
    }
    return validatePublication({ ...base, payload: { timezone: district.timezone, hero_output_id: source.hero_output_id, top_output_ids: source.top_output_ids, daily } });
  }
  const { data: story, error: storyError } = await supabase.from("nrcs_stories").select("id,title,district_key,category_id,nrcs_categories(id,name,slug)").eq("id", source.story_id).single();
  if (storyError || !story || story.district_key !== districtKey) throw new Error("Story is unavailable.");
  const versionResult = source.copy_version_id ? await supabase.from("nrcs_copy_versions").select("id,stream_id,headline,body_html").eq("id", source.copy_version_id).single() : { data: null, error: null };
  if (versionResult.error) throw new Error(versionResult.error.message);
  const version = versionResult.data;
  const streamResult = version ? await supabase.from("nrcs_copy_streams").select("story_id,stream_type").eq("id", version.stream_id).single() : { data: null, error: null };
  if (streamResult.error) throw new Error(streamResult.error.message);
  const stream = streamResult.data;
  if (version && (stream?.story_id !== story.id || stream?.stream_type !== "web")) throw new Error("Copy version does not belong to this Story's Web Copy.");
  const { data: links, error: linksError } = await supabase.from("nrcs_web_output_media").select("asset_id").eq("output_id", source.id).order("position");
  const { data: tags, error: tagsError } = await supabase.from("nrcs_story_tags").select("nrcs_tags(id,name,slug,tag_type,nrcs_tag_aliases(alias))").eq("story_id", story.id).order("tag_id");
  if (linksError || tagsError) throw new Error(linksError?.message || tagsError?.message);
  const ids = [...new Set([source.hero_asset_id, source.video_asset_id, ...(links || []).map(l => l.asset_id)].filter(Boolean))];
  const assetResult = ids.length ? await supabase.from("nrcs_assets").select(assetSelect).in("id", ids) : { data: [], error: null };
  if (assetResult.error) throw new Error(assetResult.error.message);
  const byId = new Map((assetResult.data || []).map(a => [a.id, a as Asset]));
  function selected(id: string) { const asset = byId.get(id); if (!asset) throw new Error("Selected media is unavailable."); return media(asset); }
  const category = Array.isArray(story.nrcs_categories) ? story.nrcs_categories[0] || null : story.nrcs_categories;
  // Include stable migration linkage independently of a subsequently edited slug.
  const cmsArticleId = source.cms_story_id || null;
  const publicTags = (tags || []).flatMap(t => Array.isArray(t.nrcs_tags) ? t.nrcs_tags : t.nrcs_tags ? [t.nrcs_tags] : [])
    .map(t => ({ id: t.id, name: t.name, slug: t.slug, tag_type: t.tag_type,
      aliases: [...new Set((t.nrcs_tag_aliases || []).map(a => a.alias.trim().toLowerCase())
        .filter(alias => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(alias)))].sort() }));
  return validatePublication({ ...base, payload: { cms_article_id: cmsArticleId, story_id: story.id, copy_version_id: source.copy_version_id, title: version?.headline || story.title, body_html: sanitizeRichTextHtml(version?.body_html || ""), tease: source.tease, slug: source.slug, status: source.status, scheduled_at: source.scheduled_at, published_at: source.published_at, seo_title: source.seo_title, seo_description: source.seo_description, category, tags: publicTags, hero: source.hero_asset_id ? selected(source.hero_asset_id) : null, article_media: (links || []).map(l => selected(l.asset_id)), video: source.video_asset_id ? selected(source.video_asset_id) : null } });
}
export async function getDelivery(kind: PublicationKind, sourceId: string, revision: number, districtKey: string) {
  const supabase = await createNrcsServerClient();
  const { data, error } = await supabase.from("nrcs_publication_deliveries").select("request_id,kind,source_id,revision,district_key,status,attempts,lease_until,last_error,receipt,updated_at").eq("kind", kind).eq("source_id", sourceId).eq("revision", revision).eq("district_key", districtKey).maybeSingle();
  if (error) throw new Error(error.message);
  return data as DeliverySummary | null;
}
export async function transmitPublication(envelope: PublicationEnvelope, hash: string): Promise<PublicationReceipt> {
  const env = getNrcsCmsApiEnv();
  if (!env) throw new Error("NRCS CMS API configuration is missing.");
  const endpoint = `${env.baseUrl}/api/nrcs/publications`;
  const response = await fetch(endpoint, { method: "POST", redirect: "manual", headers: { Authorization: `Bearer ${env.secret}`, "Content-Type": "application/json" }, body: JSON.stringify(envelope), signal: AbortSignal.timeout(20000), cache: "no-store" });
  if (response.status >= 300 && response.status < 400) throw new Error("CMS endpoint redirected. Use the canonical CMS host in NRCS_CMS_API_BASE_URL; this request was not confirmed.");
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok !== true) throw new Error(typeof data?.error === "string" ? data.error.slice(0, 2000) : `CMS rejected delivery (${response.status}).`);
  return verifyPublicationReceipt(data.receipt, envelope, hash, true);
}
export async function sendPublication(kind: PublicationKind, sourceId: string, districtKey: string, revision: number) {
  const existing = await getDelivery(kind, sourceId, revision, districtKey);
  const service = createNrcsServiceClient();
  if (!existing) {
    const envelope = await buildPublication(kind, sourceId, districtKey, revision);
    const supabase = await createNrcsServerClient();
    const table = kind === "web" ? "nrcs_web_outputs" : kind === "homepage" ? "nrcs_homepage_lineups" : "nrcs_priority_alerts";
    const { data: current, error: currentError } = await supabase.from(table).select("revision").eq(kind === "homepage" ? "district_key" : "id", sourceId).single();
    if (currentError || current?.revision !== revision) throw new Error("Source changed while preparing delivery. Reload before sending.");
    const hash = createHash("sha256").update(canonicalPublication(envelope)).digest("hex");
    const { error: insertError } = await service.from("nrcs_publication_deliveries").upsert({ request_id: envelope.request_id, kind, source_id: sourceId, revision, district_key: districtKey, package: envelope, content_hash: hash }, { onConflict: "kind,source_id,revision", ignoreDuplicates: true });
    if (insertError) throw new Error(insertError.message);
  }
  const { data: stored, error: readError } = await service.from("nrcs_publication_deliveries").select("*").eq("kind", kind).eq("source_id", sourceId).eq("revision", revision).eq("district_key", districtKey).single();
  if (readError) throw new Error(readError.message);
  const delivery = stored as Delivery;
  if (delivery.status === "received") return getDelivery(kind, sourceId, revision, districtKey);
  const { data: claimed, error: claimError } = await service.rpc("nrcs_claim_publication_delivery", { p_request_id: delivery.request_id });
  if (claimError) throw new Error(claimError.message);
  if (!claimed) return getDelivery(kind, sourceId, revision, districtKey);
  const attempt = claimed as Delivery;
  let receipt: PublicationReceipt | null = null, lastError: string | null = null;
  try { receipt = await transmitPublication(attempt.package, attempt.content_hash); }
  catch (failure) { lastError = failure instanceof Error && failure.name === "TimeoutError" ? "CMS confirmation timed out. Retry reuses the same request; it may already have been received." : failure instanceof Error ? failure.message.slice(0, 2000) : "CMS delivery failed."; }
  const { data: completed, error: completeError } = await service.from("nrcs_publication_deliveries").update({ status: receipt ? "received" : "failed", receipt, last_error: lastError, lease_until: null }).eq("request_id", attempt.request_id).eq("attempts", attempt.attempts).select("request_id").maybeSingle();
  if (completeError || !completed) throw new Error("Delivery confirmation could not be recorded. Reload/retry; the same request will be reused.");
  return getDelivery(kind, sourceId, revision, districtKey);
}
