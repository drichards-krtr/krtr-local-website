import { cache } from "react";
import { KRTR_TIMEZONE } from "@/lib/dates";
import type { DistrictKey } from "@/lib/districts";
import { createPublicClient } from "@/lib/supabase/public";

export type DailyVideoOrientation = "vertical" | "horizontal";

export type PublicDaily = {
  id: string;
  slug: string | null;
  title: string;
  published_at: string | null;
  image_url: string | null;
  mux_playback_id: string | null;
  video_orientation: DailyVideoOrientation;
};

const PUBLIC_DAILY_SELECT =
  "id, slug, title, published_at, image_url, mux_playback_id, video_orientation";

export const RESERVED_DAILY_SLUGS = new Set([
  "about",
  "advertise",
  "calendar",
  "cms",
  "feed.xml",
  "festival-of-trails",
  "garage-sales",
  "manifest.webmanifest",
  "nominations",
  "robots.txt",
  "sitemap.xml",
  "stories",
  "submit-story",
  "tags",
  "termsprivacy",
  "vote",
  "watch-live",
  "weather",
]);

export function slugifyDailyTitle(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildDailySlug(title: string, publishedAt?: string | null) {
  const slug = slugifyDailyTitle(title || "daily");
  if (!RESERVED_DAILY_SLUGS.has(slug)) return slug;

  const dateSource = publishedAt ? new Date(publishedAt) : new Date();
  const dateText = new Intl.DateTimeFormat("en-US", {
    timeZone: KRTR_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(dateSource)
    .replace(/\D/g, "-")
    .replace(/-+$/g, "");
  return `${slug}-${dateText}`;
}

function publishedAtVisibilityFilter() {
  return `published_at.is.null,published_at.lte.${new Date().toISOString()}`;
}

export const getLatestPublishedDaily = cache(async function getLatestPublishedDaily(
  districtKey: DistrictKey
) {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("dailys")
    .select(PUBLIC_DAILY_SELECT)
    .eq("district_key", districtKey)
    .eq("status", "published")
    .or(publishedAtVisibilityFilter())
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[getLatestPublishedDaily:${districtKey}] ${error.message}`);
  }

  return (data || null) as PublicDaily | null;
});

export const getPublishedDailyBySlug = cache(async function getPublishedDailyBySlug(
  districtKey: DistrictKey,
  slug: string
) {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("dailys")
    .select(PUBLIC_DAILY_SELECT)
    .eq("district_key", districtKey)
    .eq("slug", slug)
    .eq("status", "published")
    .or(publishedAtVisibilityFilter())
    .maybeSingle();

  if (error) {
    throw new Error(`[getPublishedDailyBySlug:${districtKey}:${slug}] ${error.message}`);
  }

  return (data || null) as PublicDaily | null;
});

export function dailyHref(daily: { id: string; slug?: string | null }) {
  return `/${daily.slug || daily.id}`;
}
