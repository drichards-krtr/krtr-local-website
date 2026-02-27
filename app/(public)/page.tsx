import { createPublicClient } from "@/lib/supabase/public";
import AdSlot from "@/components/public/AdSlot";
import { createServiceClient } from "@/lib/supabase/admin";
import StoryRow from "@/components/public/StoryRow";
import { pickAndTrackAdsForPlacement } from "@/lib/ads";
import { storyHref } from "@/lib/stories";

export const dynamic = "force-dynamic";

type Story = {
  id: string;
  slug?: string | null;
  title: string;
  tease: string | null;
  image_url: string | null;
  published_at: string | null;
};

async function getHomepageAds() {
  try {
    const supabase = createServiceClient();
    return await pickAndTrackAdsForPlacement({
      supabase,
      placement: "homepage",
      count: 3,
    });
  } catch (error) {
    console.error("[HomePage:getHomepageAds] Failed to load tracked ads", error);
    return [];
  }
}

async function getSlotStories() {
  const supabase = createPublicClient();
  const { data: slots, error: slotsError } = await supabase
    .from("story_slots")
    .select("slot, story_id");

  if (slotsError) {
    console.error("[HomePage:getSlotStories] story_slots query failed", slotsError);
    throw new Error(`[HomePage:getSlotStories:story_slots] ${slotsError.message}`);
  }

  const slotIds = (slots || [])
    .map((slot) => slot.story_id)
    .filter(Boolean) as string[];

  if (!slotIds.length) return { storiesById: new Map(), slots: [] };

  const { data: stories, error: storiesError } = await supabase
    .from("stories")
    .select("id, slug, title, tease, image_url, published_at")
    .eq("status", "published")
    .in("id", slotIds);

  if (storiesError) {
    console.error("[HomePage:getSlotStories] stories query failed", storiesError);
    throw new Error(`[HomePage:getSlotStories:stories] ${storiesError.message}`);
  }

  const storiesById = new Map<string, Story>();
  (stories || []).forEach((story) => storiesById.set(story.id, story as Story));
  return { storiesById, slots: slots || [] };
}

async function getRecentStories(skipIds: string[]) {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("stories")
    .select("id, slug, title, tease, image_url, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(16);

  if (error) {
    console.error("[HomePage:getRecentStories] Supabase query failed", error);
    throw new Error(`[HomePage:getRecentStories] ${error.message}`);
  }

  let stories = (data || []) as Story[];

  // Fallback for environments where published_at ordering returns no rows unexpectedly.
  if (!stories.length) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("stories")
      .select("id, slug, title, tease, image_url, published_at")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(16);

    if (fallbackError) {
      console.error(
        "[HomePage:getRecentStories] fallback created_at query failed",
        fallbackError
      );
      throw new Error(
        `[HomePage:getRecentStories:fallback] ${fallbackError.message}`
      );
    }

    stories = (fallbackData || []) as Story[];
  }

  return stories.filter((story) => !skipIds.includes(story.id));
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: { debug?: string };
}) {
  const [{ storiesById, slots }, homepageAds] = await Promise.all([
    getSlotStories(),
    getHomepageAds(),
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
  const recentStories = await getRecentStories(skipIds);
  const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
    : "missing";
  const debugInfo = {
    supabaseHost,
    slots: slots.length,
    slotStoryCount: storiesById.size,
    heroStoryId: heroStory?.id || null,
    topStoryIds: topStories.map((story) => story.id),
    skippedIds: skipIds,
    recentStoryCount: recentStories.length,
    recentStoryIds: recentStories.map((story) => story.id),
    recentStorySlugs: recentStories.map((story) => story.slug || null),
  };
  console.info("[HomePage] story debug", debugInfo);

  return (
    <main className="mx-auto max-w-site px-4 py-6">
      {searchParams?.debug === "1" && (
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
                  {new Date(heroStory.published_at).toLocaleDateString()}
                </p>
              )}
              {heroStory.tease && (
                <p className="mt-2 text-neutral-700">{heroStory.tease}</p>
              )}
            </div>
          </a>
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
