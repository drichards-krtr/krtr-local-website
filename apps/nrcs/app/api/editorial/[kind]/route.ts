import { after, NextResponse } from "next/server";
import { getCurrentNrcsStaff } from "@/lib/auth";
import { createNrcsServerClient } from "@/lib/server";
import { getNrcsDistrictContext } from "@/lib/districts";
import { formatDateTimeForInput, localDateTimeInputToUtcIso } from "@/lib/localDates";
import { UUID_PATTERN } from "@/lib/graphics";
import { SOCIAL_DESTINATIONS } from "@/lib/outputs";
import { normalizeSlug } from "@/lib/stories";
import { getCloudinaryCredentials } from "@/lib/cloudinary";
import { processPublicationDelivery, queuePublication } from "@/lib/publicationDelivery";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  const staff = await getCurrentNrcsStaff();
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (staff.profile.role === "contributor") return NextResponse.json({ error: "Editors/admins only." }, { status: 403 });
  if ((await context.params).kind !== "homepage") return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const params = new URL(request.url).searchParams;
    const district = params.get("district") || "";
    const type = params.get("type");
    const offset = Number(params.get("offset") || 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new Error("Invalid offset.");
    const q = (params.get("q") || "").trim().slice(0, 100).replace(/[%_\\]/g, "");
    const supabase = await createNrcsServerClient();
    const { data: access } = await supabase.rpc("nrcs_can_access_district", { requested_district_key: district });
    if (!access) return NextResponse.json({ error: "District is not accessible." }, { status: 403 });
    const selected = params.get("selected");
    if (selected) uuid(selected);
    let results: Array<{ id: string; title: string; subtitle?: string; thumbnail?: string | null }> = [];
    let hasMore = false;
    if (type === "output" || type === "story") {
      let query = supabase.from("nrcs_web_outputs").select("id,story_id,status,nrcs_stories!inner(title)").eq("district_key", district).in("status", type === "story" ? ["published"] : ["scheduled", "published"]).order("updated_at", { ascending: false }).order("id");
      if (selected) query = query.eq(type === "story" ? "story_id" : "id", selected);
      else if (q) query = query.ilike("nrcs_stories.title", `%${q}%`);
      const { data, error } = await query.range(offset, offset + 25);
      if (error) throw new Error(error.message);
      hasMore = (data || []).length > 25;
      results = (data || []).slice(0, 25).map(row => ({ id: type === "story" ? row.story_id : row.id, title: (Array.isArray(row.nrcs_stories) ? row.nrcs_stories[0] : row.nrcs_stories)?.title || "Untitled", subtitle: row.status }));
    } else if (type === "edition" || type === "event") {
      let query = supabase.from(type === "edition" ? "nrcs_editions" : "nrcs_events").select("id,title,status").eq("district_key", district).order(type === "edition" ? "air_at" : "start_at", { ascending: false }).order("id");
      if (type === "event") query = query.eq("status", "published");
      if (selected) query = query.eq("id", selected); else if (q) query = query.ilike("title", `%${q}%`);
      const { data, error } = await query.range(offset, offset + 25);
      if (error) throw new Error(error.message);
      hasMore = (data || []).length > 25; results = (data || []).slice(0, 25).map(row => ({ id: row.id, title: row.title, subtitle: row.status }));
    } else if (type === "library") {
      let query = supabase.from("nrcs_assets").select("id,title,asset_type,cloudinary_url,thumbnail_url,mux_status,mux_playback_id").in("asset_type", ["image", "graphic", "video"]).or(`asset_type.in.(image,graphic),district_key.eq.${district.replace(/[^a-zA-Z0-9_-]/g, "")}`).order("created_at", { ascending: false }).order("id");
      if (selected) query = query.eq("id", selected); else if (q) query = query.ilike("title", `%${q}%`);
      const { data, error } = await query.range(offset, offset + 25);
      if (error) throw new Error(error.message);
      hasMore = (data || []).length > 25;
      results = (data || []).slice(0, 25).flatMap(a => (["image", "graphic"].includes(a.asset_type) && a.cloudinary_url || a.asset_type === "video" && a.mux_status === "ready" && a.mux_playback_id) ? [{ id: a.id, title: a.title, subtitle: a.asset_type, thumbnail: a.cloudinary_url || a.thumbnail_url }] : []);
    } else if (type === "asset") {
      const edition = uuid(params.get("edition")) as string;
      const { data: editionRow } = await supabase.from("nrcs_editions").select("district_key").eq("id", edition).maybeSingle();
      if (!editionRow || editionRow.district_key !== district) throw new Error("Edition district mismatch.");
      let query = supabase.from("nrcs_edition_assets").select("asset_id,nrcs_assets!inner(id,title,asset_type,cloudinary_url,thumbnail_url,mux_status,mux_playback_id)").eq("edition_id", edition).order("asset_id");
      if (selected) query = query.eq("asset_id", selected); else if (q) query = query.ilike("nrcs_assets.title", `%${q}%`);
      const { data, error } = await query.range(offset, offset + 25);
      if (error) throw new Error(error.message);
      hasMore = (data || []).length > 25;
      results = (data || []).slice(0, 25).flatMap(row => {
        const a = Array.isArray(row.nrcs_assets) ? row.nrcs_assets[0] : row.nrcs_assets;
        const ready = a && (["image", "graphic"].includes(a.asset_type) && a.cloudinary_url || a.asset_type === "video" && a.mux_status === "ready" && a.mux_playback_id);
        return ready ? [{ id: a.id, title: a.title, subtitle: a.asset_type, thumbnail: a.cloudinary_url || a.thumbnail_url }] : [];
      });
    } else throw new Error("Invalid lookup type.");
    return NextResponse.json({ results, hasMore }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Lookup failed." }, { status: 400 }); }
}
function text(value: unknown, max: number) {
  if (typeof value !== "string" || value.length > max) throw new Error("Invalid text field.");
  return value.trim();
}
function uuid(value: unknown, optional = false): string | null {
  if (optional && !value) return null;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new Error("Invalid object ID.");
  return value;
}
function ids(value: unknown, limit = 100) {
  if (!Array.isArray(value) || value.length > limit) throw new Error("Invalid media/placement selection.");
  const result = value.map(v => uuid(v) as string);
  if (new Set(result).size !== result.length) throw new Error("Duplicate selection.");
  return result;
}
function url(value: unknown) {
  const result = text(value ?? "", 2000);
  if (!result) return null;
  const parsed = new URL(result);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("Use an HTTP or HTTPS URL without credentials.");
  return parsed.href;
}
export async function POST(request: Request, context: { params: Promise<{ kind: string }> }) {
  const staff = await getCurrentNrcsStaff();
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { kind } = await context.params;
    if (!["web", "social", "homepage", "alert", "daily", "edition-media", "image"].includes(kind)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const raw = await request.text();
    if (raw.length > 32000) throw new Error("Request is too large.");
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request.");
    if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw new Error("Invalid revision.");
    const districts = await getNrcsDistrictContext();
    const district = districts.allowedDistricts.find(d => d.district_key === body.district_key);
    if (!district) return NextResponse.json({ error: "District is not accessible." }, { status: 403 });
    const editor = staff.profile.role !== "contributor";
    if (["homepage", "alert", "daily", "edition-media"].includes(kind) && !editor) return NextResponse.json({ error: "Editors/admins only." }, { status: 403 });
    function date(value: unknown) {
      if (!value) return null;
      const local = text(value, 19);
      const iso = localDateTimeInputToUtcIso(local, district!.timezone);
      if (!iso || formatDateTimeForInput(iso, district!.timezone) !== local.slice(0, 16)) throw new Error("Invalid local date/time (including daylight-saving gaps).");
      return iso;
    }
    const supabase = await createNrcsServerClient();
    async function queue(kind: "web" | "homepage" | "alert" | "daily", sourceId: string, revision: number) {
      try {
        const delivery = await queuePublication(kind, sourceId, district!.district_key, revision);
        after(async () => {
          try { await processPublicationDelivery(delivery.request_id); }
          catch (error) { console.error("Asynchronous CMS delivery failed", { requestId: delivery.request_id, error }); }
        });
        return { delivery, queueError: null };
      } catch (error) {
        const queueError = error instanceof Error ? error.message : "CMS delivery could not be queued.";
        console.error("CMS delivery queue creation failed", { kind, sourceId, revision, error });
        return { delivery: null, queueError };
      }
    }
    if (kind === "image") {
      if (body.edition_id && !editor) return NextResponse.json({ error: "Editors/admins only." }, { status: 403 });
      const cloudinaryUrl = url(body.cloudinary_url);
      const { cloudName } = getCloudinaryCredentials();
      const parsed = cloudinaryUrl ? new URL(cloudinaryUrl) : null;
      if (!parsed || parsed.hostname !== "res.cloudinary.com" || !parsed.pathname.startsWith(`/${cloudName}/image/`)) throw new Error("Choose an image from the configured Cloudinary library.");
      const title = text(body.title, 1000);
      const publicId = text(body.cloudinary_public_id, 1000);
      const { data: assetId, error } = await supabase.rpc("nrcs_attach_output_image", { p_asset: { title, cloudinary_public_id: publicId, cloudinary_url: cloudinaryUrl }, p_district: district.district_key, p_story: uuid(body.story_id, true), p_edition: uuid(body.edition_id, true) });
      if (error) throw new Error(error.message);
      const { data: asset, error: readError } = await supabase.from("nrcs_assets").select("id,title,asset_type,cloudinary_url,thumbnail_url,mux_status,mux_playback_id").eq("id", assetId).single();
      if (readError) throw new Error("Attached, but confirmation could not be loaded. Reload before retrying.");
      return NextResponse.json({ ok: true, asset, message: "Cloudinary image attached." });
    }
    if (kind === "edition-media") {
      const editionId = uuid(body.edition_id) as string;
      const assetId = uuid(body.asset_id) as string;
      const { data: edition } = await supabase.from("nrcs_editions").select("district_key").eq("id", editionId).maybeSingle();
      const { data: asset } = await supabase.from("nrcs_assets").select("id,title,asset_type,cloudinary_url,thumbnail_url,mux_status,mux_playback_id,district_key").eq("id", assetId).maybeSingle();
      if (!edition || edition.district_key !== district.district_key || !asset || !(["image", "graphic"].includes(asset.asset_type) && asset.cloudinary_url || asset.asset_type === "video" && asset.district_key === district.district_key && asset.mux_status === "ready" && asset.mux_playback_id)) throw new Error("Select ready district video or shared image/graphic media for this Edition.");
      const { error } = await supabase.from("nrcs_edition_assets").upsert({ edition_id: editionId, asset_id: assetId }, { onConflict: "edition_id,asset_id", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, asset: { id: asset.id, title: asset.title, asset_type: asset.asset_type, thumbnail_url: asset.cloudinary_url || asset.thumbnail_url }, message: "Media attached to Edition." });
    }
    if (kind === "web" || kind === "social") {
      const storyId = uuid(body.story_id) as string;
      const { data: story, error: storyError } = await supabase.from("nrcs_stories").select("id,district_key,created_by").eq("id", storyId).maybeSingle();
      if (storyError) throw new Error(storyError.message);
      if (!story || story.district_key !== district.district_key || !editor && story.created_by !== staff.profile.id) return NextResponse.json({ error: "Story is not editable." }, { status: 403 });
      const allowed = kind === "web" ? ["draft", "scheduled", "published", "unpublished"] : ["draft", "scheduled", "published"];
      if (!allowed.includes(body.status)) throw new Error("Invalid output status.");
      if (!editor && body.status !== "draft") return NextResponse.json({ error: "Contributors can save drafts only." }, { status: 403 });
      const common = { story_id: storyId, district_key: district.district_key, copy_version_id: uuid(body.copy_version_id, true), status: body.status, scheduled_at: date(body.scheduled_at), published_at: date(body.published_at) || (body.status === "published" ? new Date().toISOString() : null) };
      if (kind === "web") {
        const slug = text(body.slug ?? "", 240);
        const { data: outputId, error } = await supabase.rpc("nrcs_save_web_output", { p_output: { ...common, slug: slug ? normalizeSlug(slug) : null, hero_asset_id: uuid(body.hero_asset_id, true), video_asset_id: uuid(body.video_asset_id, true), tease: text(body.tease ?? "", 1000), seo_title: text(body.seo_title ?? "", 240), seo_description: text(body.seo_description ?? "", 1000) }, p_media: ids(body.media_ids), p_revision: body.revision });
        if (error) throw new Error(error.message);
        const { data: output, error: readError } = await supabase.from("nrcs_web_outputs").select("*").eq("id", outputId).single();
        if (readError) throw new Error("Saved, but confirmation could not be loaded. Reload before retrying. " + readError.message);
        const queued = await queue("web", output.id, output.revision);
        return NextResponse.json({ ok: true, output, ...queued, message: queued.delivery ? "Web Output saved and queued for CMS delivery." : "Web Output saved, but CMS delivery could not be queued. Use Queue CMS Delivery below." });
      }
      if (!(SOCIAL_DESTINATIONS as readonly string[]).includes(body.destination)) throw new Error("Invalid social destination.");
      const id = uuid(body.id) as string;
      const payload = { ...common, id, destination: body.destination, asset_ids: ids(body.asset_ids), published_url: url(body.published_url) };
      const query = body.revision === 0 ? supabase.from("nrcs_social_outputs").insert(payload) : supabase.from("nrcs_social_outputs").update(payload).eq("id", id).eq("story_id", storyId).eq("revision", body.revision);
      const { data: output, error } = await query.select("*").maybeSingle();
      if (error) throw new Error(error.message);
      if (!output) throw new Error("Output changed or is not editable. Reload before saving.");
      return NextResponse.json({ ok: true, output, message: "Social output saved." });
    }
    if (kind === "homepage") {
      const dailyId = uuid(body.daily_edition_id, true);
      const publicationDate = dailyId ? text(body.daily_publication_date, 10) : null;
      if (publicationDate && (!/^\d{4}-\d{2}-\d{2}$/.test(publicationDate) || new Date(publicationDate + "T12:00:00Z").toISOString().slice(0, 10) !== publicationDate)) throw new Error("Invalid publication date.");
      const payload = { district_key: district.district_key, hero_output_id: uuid(body.hero_output_id, true), top_output_ids: ids(body.top_output_ids, 4), daily_edition_id: dailyId, daily_asset_id: dailyId ? uuid(body.daily_asset_id) : null, daily_publication_date: publicationDate };
      const query = body.revision === 0 ? supabase.from("nrcs_homepage_lineups").insert(payload) : supabase.from("nrcs_homepage_lineups").update(payload).eq("district_key", district.district_key).eq("revision", body.revision);
      const { data: lineup, error } = await query.select("*").maybeSingle();
      if (error) throw new Error(error.message);
      if (!lineup) throw new Error("Lineup changed. Reload before saving.");
      const queued = await queue("homepage", lineup.district_key, lineup.revision);
      return NextResponse.json({ ok: true, lineup, ...queued, message: queued.delivery ? "Homepage instructions saved and queued for CMS delivery." : "Homepage instructions saved, but CMS delivery could not be queued. Use Queue CMS Delivery below." });
    }
    if (kind === "daily") {
      const id = uuid(body.id) as string;
      const editionId = uuid(body.edition_id) as string;
      const heroAssetId = uuid(body.hero_asset_id) as string;
      const videoAssetId = uuid(body.video_asset_id) as string;
      if (!["draft", "scheduled", "published", "archived"].includes(body.status)) throw new Error("Invalid Daily status.");
      const payload = { id, district_key: district.district_key, edition_id: editionId, hero_asset_id: heroAssetId, video_asset_id: videoAssetId, asset_id: heroAssetId, status: body.status, scheduled_at: date(body.scheduled_at) };
      if (!payload.scheduled_at) throw new Error("Daily publication date/time is required.");
      const query = body.revision === 0 ? supabase.from("nrcs_dailies").insert(payload) : supabase.from("nrcs_dailies").update(payload).eq("id", id).eq("district_key", district.district_key).eq("revision", body.revision);
      const { data: daily, error } = await query.select("*").maybeSingle();
      if (error) throw new Error(error.message);
      if (!daily) throw new Error("Daily changed. Reload before saving.");
      const queued = await queue("daily", daily.id, daily.revision);
      return NextResponse.json({ ok: true, daily, ...queued, message: queued.delivery ? "Daily saved and queued for CMS delivery." : "Daily saved, but CMS delivery could not be queued. Use Queue CMS Delivery below." });
    }
    const id = uuid(body.id) as string;
    if (body.operation === "delete") {
      const { data: deleted, error } = await supabase.rpc("nrcs_delete_undelivered_alert", { p_id: id, p_revision: body.revision });
      if (error) throw new Error(error.message);
      if (!deleted) throw new Error("Alert changed or no longer exists. Reload before deleting.");
      return NextResponse.json({ ok: true, deleted: id, message: "Undelivered Alert deleted." });
    }
    if (body.operation === "archive") {
      const { data: alert, error } = await supabase.from("nrcs_priority_alerts").update({ active: false, archived_at: new Date().toISOString() }).eq("id", id).eq("district_key", district.district_key).eq("revision", body.revision).is("archived_at", null).select("*").maybeSingle();
      if (error) throw new Error(error.message);
      if (!alert) throw new Error("Alert changed or is already archived. Reload before archiving.");
      const queued = await queue("alert", alert.id, alert.revision);
      return NextResponse.json({ ok: true, alert, ...queued, message: queued.delivery ? "Alert archived and its disabled revision queued for CMS delivery." : "Alert archived, but CMS delivery could not be queued. Use Queue CMS Delivery below." });
    }
    if (typeof body.active !== "boolean" || !["none", "story", "event", "external"].includes(body.target_type)) throw new Error("Invalid alert settings.");
    const headline = text(body.headline, 240);
    if (!headline) throw new Error("Headline is required.");
    const payload = { id, district_key: district.district_key, headline, message: text(body.message ?? "", 4000), active: body.active, start_at: date(body.start_at), end_at: date(body.end_at), target_type: body.target_type, target_id: ["story", "event"].includes(body.target_type) ? uuid(body.target_id) : null, external_url: body.target_type === "external" ? url(body.external_url) : null };
    const query = body.revision === 0 ? supabase.from("nrcs_priority_alerts").insert(payload) : supabase.from("nrcs_priority_alerts").update(payload).eq("id", id).eq("district_key", district.district_key).eq("revision", body.revision);
    const { data: alert, error } = await query.select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!alert) throw new Error("Alert changed. Reload before saving.");
    const queued = await queue("alert", alert.id, alert.revision);
    return NextResponse.json({ ok: true, alert, ...queued, message: queued.delivery ? "Priority Alert saved and queued for CMS delivery." : "Priority Alert saved, but CMS delivery could not be queued. Use Queue CMS Delivery below." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save.";
    return NextResponse.json({ error: message }, { status: /changed|duplicate key/i.test(message) ? 409 : 400 });
  }
}
