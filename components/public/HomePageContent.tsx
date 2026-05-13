import type { ReactNode } from "react";
import Link from "next/link";
import AdSlot from "@/components/public/AdSlot";
import { createPublicClient } from "@/lib/supabase/public";
import { createServiceClient } from "@/lib/supabase/admin";
import StoryRow from "@/components/public/StoryRow";
import { pickAndTrackAdsForPlacement, type Ad } from "@/lib/ads";
import { formatDateInTimeZone, getDateTextInTimeZone } from "@/lib/dates";
import { getNominationBannerText } from "@/lib/nominations";
import { getCurrentOpenNomination } from "@/lib/nominationsServer";
import { getVotingBannerText } from "@/lib/nominationVoting";
import { getCurrentOpenVotingSession } from "@/lib/nominationVotingServer";
import { storyHref } from "@/lib/stories";
import type { DistrictKey, SiteScopeKey } from "@/lib/districts";

type Story = {
  id: string;
  slug?: string | null;
  title: string;
  tease: string | null;
  image_url: string | null;
  published_at: string | null;
};

type HomePageContentProps = {
  siteScopeKey: SiteScopeKey;
  debug?: boolean;
  showDistrictBanners?: boolean;
  trackAds?: boolean;
  previewBanner?: ReactNode;
};

async function getHomepageAds(siteScopeKey: string, trackAds: boolean) {
  try {
    if (trackAds) {
      const supabase = createServiceClient();
      return await pickAndTrackAdsForPlacement({
        supabase,
        districtKey: siteScopeKey,
        placement: "homepage",
        count: 3,
      });
    }

    const supabase = createPublicClient();
    const day = getDateTextInTimeZone();
    const { data, error } = await supabase
      .from("ads")
      .select("id, placement, image_url, link_url, html, weight")
      .eq("district_key", siteScopeKey)
      .eq("placement", "homepage")
      .eq("active", true)
      .lte("start_date", day)
      .gte("end_date", day)
      .limit(3);

    if (error) {
      throw new Error(`[HomePageContent:getHomepageAds:preview] ${error.message}`);
    }

    return (data || []) as Ad[];
  } catch (error) {
    console.error("[HomePageContent:getHomepageAds] Failed to load ads", error);
    return [];
  }
}

async function getSlotStories(siteScopeKey: string) {
  const supabase = createPublicClient();
  const publishVisibilityFilter = `published_at.is.null,published_at.lte.${new Date().toISOString()}`;
  const { data: slots, error: slotsError } = await supabase
    .from("story_slots")
    .select("slot, story_id")
    .eq("district_key", siteScopeKey);

  if (slotsError) {
    console.error("[HomePageContent:getSlotStories] story_slots query failed", slotsError);
    throw new Error(`[HomePageContent:getSlotStories:story_slots] ${slotsError.message}`);
  }

  const slotIds = (slots || [])
    .map((slot) => slot.story_id)
    .filter(Boolean) as string[];

  if (!slotIds.length) return { storiesById: new Map<string, Story>(), slots: [] };

  const { data: stories, error: storiesError } = await supabase
    .from("stories")
    .select("id, slug, title, tease, image_url, published_at")
    .eq("district_key", siteScopeKey)
    .eq("status", "published")
    .or(publishVisibilityFilter)
    .in("id", slotIds);

  if (storiesError) {
    console.error("[HomePageContent:getSlotStories] stories query failed", storiesError);
    throw new Error(`[HomePageContent:getSlotStories:stories] ${storiesError.message}`);
  }

  const storiesById = new Map<string, Story>();
  (stories || []).forEach((story) => storiesById.set(story.id, story as Story));
  return { storiesById, slots: slots || [] };
}

async function getRecentStories(siteScopeKey: string, skipIds: string[]) {
  const supabase = createPublicClient();
  const publishVisibilityFilter = `published_at.is.null,published_at.lte.${new Date().toISOString()}`;
  const { data, error } = await supabase
    .from("stories")
    .select("id, slug, title, tease, image_url, published_at")
    .eq("district_key", siteScopeKey)
    .eq("status", "published")
    .or(publishVisibilityFilter)
    .order("published_at", { ascending: false })
    .limit(16);

  if (error) {
    console.error("[HomePageContent:getRecentStories] Supabase query failed", error);
    throw new Error(`[HomePageContent:getRecentStories] ${error.message}`);
  }

  let stories = (data || []) as Story[];

  if (!stories.length) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("stories")
      .select("id, slug, title, tease, image_url, published_at")
      .eq("district_key", siteScopeKey)
      .eq("status", "published")
      .or(publishVisibilityFilter)
      .order("created_at", { ascending: false })
      .limit(16);

    if (fallbackError) {
      console.error(
        "[HomePageContent:getRecentStories] fallback created_at query failed",
        fallbackError
      );
      throw new Error(
        `[HomePageContent:getRecentStories:fallback] ${fallbackError.message}`
      );
    }

    stories = (fallbackData || []) as Story[];
  }

  return stories.filter((story) => !skipIds.includes(story.id));
}

export default async function HomePageContent({
  siteScopeKey,
  debug = false,
  showDistrictBanners = true,
  trackAds = true,
  previewBanner,
}: HomePageContentProps) {
  const [{ storiesById, slots }, homepageAds, activeNomination, activeVotingSession] =
    await Promise.all([
      getSlotStories(siteScopeKey),
      getHomepageAds(siteScopeKey, trackAds),
      showDistrictBanners
        ? getCurrentOpenNomination(siteScopeKey as DistrictKey)
        : Promise.resolve(null),
      showDistrictBanners
        ? getCurrentOpenVotingSession(siteScopeKey as DistrictKey)
        : Promise.resolve(null),
    ]);

  const slotMap = new Map(slots.map((slot) => [slot.slot, slot.story_id]));
  const heroStory = slotMap.get("hero")
    ? storiesById.get(slotMap.get("hero") as string)
    : null;

  const topStories = ["top1", "top2", "top3", "top4"]
    .map((slot) => slotMap.get(slot))
    .filter(Boolean)
    .map((id) => storiesById.get(id as string))
    .filter(Boolean) as Story[];

  const skipIds = [
    ...(heroStory?.id ? [heroStory.id] : []),
    ...topStories.map((story) => story.id),
  ];
  const recentStories = await getRecentStories(siteScopeKey, skipIds);
  const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
    : "missing";
  const debugInfo = {
    siteScopeKey,
    supabaseHost,
    slots: slots.length,
    slotStoryCount: storiesById.size,
    heroStoryId: heroStory?.id || null,
    topStoryIds: topStories.map((story) => story.id),
    skippedIds: skipIds,
    recentStoryCount: recentStories.length,
    recentStoryIds: recentStories.map((story) => story.id),
    recentStorySlugs: recentStories.map((story) => story.slug || null),
    homepageAdCount: homepageAds.length,
  };
  console.info("[HomePageContent] story debug", debugInfo);

  return (
    <main className="mx-auto max-w-site px-4 py-6">
      {previewBanner}
      {debug && (
        <pre className="mb-6 overflow-auto rounded bg-neutral-900 p-3 text-xs text-white">
          {JSON.stringify(debugInfo, null, 2)}
        </pre>
      )}
      {heroStory && (
        <section className="mb-8 rounded-lg bg-white p-4">
          <a href={storyHref(heroStory)} className="block">
            {heroStory.image_url && (
              <img
                src={heroStory.image_url}
                alt=""
                className="w-full rounded-lg object-cover"
              />
            )}
            <div className="mt-4">
              <h1 className="text-2xl font-semibold">{heroStory.title}</h1>
              {heroStory.published_at && (
                <p className="text-sm text-muted">
                  {formatDateInTimeZone(heroStory.published_at)}
                </p>
              )}
              {heroStory.tease && (
                <p className="mt-2 text-neutral-700">{heroStory.tease}</p>
              )}
            </div>
          </a>
        </section>
      )}

      {activeVotingSession && (
        <section className="mb-8">
          <Link
            href={`/nominations/vote/${activeVotingSession.slug}`}
            className="block rounded-lg border border-neutral-200 bg-gradient-to-r from-sky-100 via-white to-emerald-50 p-5 transition hover:border-neutral-300 hover:shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-600">
              Voting Open
            </p>
            <p className="mt-2 text-xl font-semibold text-neutral-900">
              {getVotingBannerText(activeVotingSession.category)}
            </p>
            <p className="mt-2 text-sm text-neutral-700">Tap here to vote for this month&apos;s finalists.</p>
          </Link>
        </section>
      )}

      {activeNomination && (
        <section className="mb-8">
          <Link
            href="/nominations"
            className="block rounded-lg border border-neutral-200 bg-gradient-to-r from-amber-100 via-orange-50 to-white p-5 transition hover:border-neutral-300 hover:shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-600">
              Nominations Open
            </p>
            <p className="mt-2 text-xl font-semibold text-neutral-900">
              {getNominationBannerText(activeNomination.category)}
            </p>
            <p className="mt-2 text-sm text-neutral-700">Tap here to submit a nomination.</p>
          </Link>
        </section>
      )}

      {topStories.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Top Stories</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {topStories.map((story) => (
              <StoryRow key={story.id} story={story} />
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Recent Stories</h2>
        <div className="grid gap-4">
          {recentStories.map((story) => (
            <StoryRow key={story.id} story={story} />
          ))}
          {recentStories.length === 0 && (
            <p className="rounded bg-white p-4 text-sm text-neutral-600">
              No recent stories were returned by the homepage query.
            </p>
          )}
        </div>
      </section>

      {homepageAds.length > 0 && (
        <section className="mb-8 grid gap-4 md:grid-cols-3">
          {homepageAds.map((ad) => (
            <AdSlot key={ad.id} ad={ad} />
          ))}
        </section>
      )}
    </main>
  );
}
