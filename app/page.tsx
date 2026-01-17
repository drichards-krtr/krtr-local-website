import { createPublicClient } from "@/lib/supabase/public";
import AdSlot from "@/components/public/AdSlot";
import StoryRow from "@/components/public/StoryRow";
import { pickWeightedAd, pickWeightedAds, type Ad } from "@/lib/ads";

type Story = {
  id: string;
  title: string;
  tease: string | null;
  image_url: string | null;
  published_at: string | null;
};

async function getAds() {
  const supabase = createPublicClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("ads")
    .select("id, placement, image_url, link_url, html, weight")
    .eq("active", true)
    .lte("start_date", today)
    .gte("end_date", today);

  return (data || []) as Ad[];
}

async function getSlotStories() {
  const supabase = createPublicClient();
  const { data: slots } = await supabase
    .from("story_slots")
    .select("slot, story_id");
  const slotIds = (slots || [])
    .map((slot) => slot.story_id)
    .filter(Boolean) as string[];

  if (!slotIds.length) return { storiesById: new Map(), slots: [] };

  const { data: stories } = await supabase
    .from("stories")
    .select("id, title, tease, image_url, published_at")
    .eq("status", "published")
    .in("id", slotIds);

  const storiesById = new Map<string, Story>();
  (stories || []).forEach((story) => storiesById.set(story.id, story as Story));
  return { storiesById, slots: slots || [] };
}

async function getRecentStories(skipIds: string[]) {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("stories")
    .select("id, title, tease, image_url, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(16);

  return (data || []).filter((story) => !skipIds.includes(story.id)) as Story[];
}

export default async function HomePage() {
  const [{ storiesById, slots }, ads] = await Promise.all([
    getSlotStories(),
    getAds(),
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

  const allsiteAd = pickWeightedAd(ads.filter((ad) => ad.placement === "allsite"));
  const homepageAds = pickWeightedAds(
    ads.filter((ad) => ad.placement === "homepage"),
    3
  );

  return (
    <main className="mx-auto max-w-site px-4 py-6">
      <div className="mb-6">
        <AdSlot ad={allsiteAd} className="mx-auto max-w-[900px]" />
      </div>

      {heroStory && (
        <section className="mb-8 rounded-lg bg-white p-4">
          <a href={`/stories/${heroStory.id}`} className="block">
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
