import { createPublicClient } from "@/lib/supabase/public";
import MuxPlayer from "@/components/public/MuxPlayer";
import Markdown from "@/components/public/Markdown";
import AdSlot from "@/components/public/AdSlot";
import { pickWeightedAd, type Ad } from "@/lib/ads";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function StoryPage({ params }: { params: { id: string } }) {
  const supabase = createPublicClient();
  const storySelect =
    "id, title, tease, body_markdown, published_at, image_url, mux_playback_id";

  const { data: storyBySlug, error: storyBySlugError } = await supabase
    .from("stories")
    .select(storySelect)
    .eq("slug", params.id)
    .eq("status", "published")
    .maybeSingle();

  if (storyBySlugError) {
    throw new Error(`[StoryPage:slugLookup] ${storyBySlugError.message}`);
  }

  let story = storyBySlug;
  if (!story && UUID_PATTERN.test(params.id)) {
    const { data: storyById, error: storyByIdError } = await supabase
      .from("stories")
      .select(storySelect)
      .eq("id", params.id)
      .eq("status", "published")
      .maybeSingle();

    if (storyByIdError) {
      throw new Error(`[StoryPage:idLookup] ${storyByIdError.message}`);
    }

    story = storyById;
  }

  if (!story) {
    return (
      <main className="mx-auto max-w-site px-4 py-10">
        <p>Story not found.</p>
      </main>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: ads } = await supabase
    .from("ads")
    .select("id, placement, image_url, link_url, html, weight")
    .eq("placement", "story")
    .eq("active", true)
    .lte("start_date", today)
    .gte("end_date", today);
  const storyAd = pickWeightedAd((ads || []) as Ad[]);

  return (
    <main className="mx-auto max-w-site px-4 py-6">
      <article className="rounded-lg bg-white p-6">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">{story.title}</h1>
          {story.published_at && (
            <time
              className="text-sm text-muted"
              dateTime={story.published_at}
            >
              {new Date(story.published_at).toLocaleDateString()}
            </time>
          )}
          {story.tease && (
            <p className="mt-2 text-neutral-700">{story.tease}</p>
          )}
        </header>
        {story.image_url && (
          <img
            src={story.image_url}
            alt=""
            className="mb-4 mx-auto block h-auto max-h-[300px] w-auto max-w-[calc(100%-2px)] rounded-lg"
          />
        )}
        {story.mux_playback_id && (
          <MuxPlayer playbackId={story.mux_playback_id} />
        )}
        <Markdown content={story.body_markdown || ""} />
      </article>

      <div className="mt-6">
        <AdSlot ad={storyAd} className="mx-auto max-w-[900px]" />
      </div>
    </main>
  );
}
