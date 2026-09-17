import { getDateTextInTimeZone } from "./localDates";

export const SOCIAL_DESTINATIONS = ["Facebook", "Instagram", "TikTok", "YouTube", "X"] as const;
export type OutputAsset = { id: string; title: string; asset_type: string; cloudinary_url: string | null; thumbnail_url: string | null; mux_status: string | null; mux_playback_id: string | null };
export type OutputVersion = { id: string; version_number: number; headline: string | null; body_html: string; created_at: string };
export type WebOutput = { id: string; revision: number; status: string; copy_version_id: string | null; slug: string | null; hero_asset_id: string | null; seo_title: string | null; seo_description: string | null; scheduled_at: string | null; published_at: string | null };
export type SocialOutput = { id: string; revision: number; destination: string; status: string; copy_version_id: string | null; asset_ids: string[]; scheduled_at: string | null; published_at: string | null; published_url: string | null };
export function isReadyPublicAsset(asset: OutputAsset) {
  return ["image", "graphic"].includes(asset.asset_type) ? Boolean(asset.cloudinary_url) : asset.asset_type === "video" && asset.mux_status === "ready" && Boolean(asset.mux_playback_id);
}
export function orderedArticleMedia(ids: string[], heroId: string | null) {
  const unique = [...new Set(ids)];
  return heroId && unique.includes(heroId) ? [heroId, ...unique.filter(id => id !== heroId)] : unique;
}
export function dailyIsEligible(date: string | null, timeZone: string, now = new Date()) {
  return Boolean(date && date === getDateTextInTimeZone(now, timeZone));
}
export function alertIsActive(alert: { active: boolean; start_at: string | null; end_at: string | null }, now = new Date()) {
  return alert.active && (!alert.start_at || new Date(alert.start_at) <= now) && (!alert.end_at || new Date(alert.end_at) > now);
}
