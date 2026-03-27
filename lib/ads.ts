import type { SupabaseClient } from "@supabase/supabase-js";
import { getDateTextInTimeZone } from "@/lib/dates";

export type Ad = {
  id: string;
  placement: "allsite" | "homepage" | "story";
  image_url: string | null;
  link_url: string | null;
  html: string | null;
  weight: number;
};

export function pickWeightedAd(ads: Ad[]) {
  if (!ads.length) return null;
  const total = ads.reduce((sum, ad) => sum + Math.max(1, ad.weight || 1), 0);
  let roll = Math.random() * total;
  for (const ad of ads) {
    roll -= Math.max(1, ad.weight || 1);
    if (roll <= 0) return ad;
  }
  return ads[0];
}

export function pickWeightedAds(ads: Ad[], count: number) {
  const pool = [...ads];
  const picked: Ad[] = [];
  while (pool.length && picked.length < count) {
    const choice = pickWeightedAd(pool);
    if (!choice) break;
    picked.push(choice);
    const idx = pool.findIndex((ad) => ad.id === choice.id);
    if (idx >= 0) pool.splice(idx, 1);
  }
  return picked;
}

export function pickLeastShownAds(
  ads: Ad[],
  showCounts: Map<string, number>,
  count: number
) {
  const limit = Math.max(1, count);
  const pool = ads.map((ad) => ({
    ad,
    shown: showCounts.get(ad.id) ?? 0,
  }));
  const picked: Ad[] = [];

  while (pool.length && picked.length < limit) {
    const minShown = pool.reduce(
      (min, entry) => Math.min(min, entry.shown),
      Number.POSITIVE_INFINITY
    );
    const eligible = pool
      .filter((entry) => entry.shown === minShown)
      .map((entry) => entry.ad);
    const choice = pickWeightedAd(eligible);
    if (!choice) break;

    picked.push(choice);
    const idx = pool.findIndex((entry) => entry.ad.id === choice.id);
    if (idx >= 0) pool.splice(idx, 1);
  }

  return picked;
}

type PickAndTrackAdsForPlacementOptions = {
  supabase: SupabaseClient;
  districtKey: string;
  placement: Ad["placement"];
  count?: number;
  onDate?: string;
};

export async function pickAndTrackAdsForPlacement({
  supabase,
  districtKey,
  placement,
  count = 1,
  onDate,
}: PickAndTrackAdsForPlacementOptions) {
  const day = onDate ?? getDateTextInTimeZone();

  const { data: adRows, error: adError } = await supabase
    .from("ads")
    .select("id, placement, image_url, link_url, html, weight")
    .eq("district_key", districtKey)
    .eq("placement", placement)
    .eq("active", true)
    .lte("start_date", day)
    .gte("end_date", day);

  if (adError) {
    throw new Error(`[ads:pickAndTrackAdsForPlacement:ads] ${adError.message}`);
  }

  const ads = (adRows || []) as Ad[];
  if (!ads.length) return [];

  const adIds = ads.map((ad) => ad.id);
  const { data: impressionRows, error: impressionError } = await supabase
    .from("ad_daily_impressions")
    .select("ad_id, show_count")
    .eq("shown_on", day)
    .in("ad_id", adIds);

  if (impressionError) {
    throw new Error(
      `[ads:pickAndTrackAdsForPlacement:impressions] ${impressionError.message}`
    );
  }

  const showCounts = new Map<string, number>();
  for (const row of impressionRows || []) {
    showCounts.set(String(row.ad_id), Number(row.show_count) || 0);
  }

  const picked = pickLeastShownAds(ads, showCounts, count);
  if (!picked.length) return [];

  const { error: incrementError } = await supabase.rpc(
    "increment_ad_daily_impressions",
    {
      p_shown_on: day,
      p_ad_ids: picked.map((ad) => ad.id),
    }
  );

  if (incrementError) {
    throw new Error(
      `[ads:pickAndTrackAdsForPlacement:increment] ${incrementError.message}`
    );
  }

  return picked;
}
