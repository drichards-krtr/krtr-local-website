import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/admin";
import MuxPlayer from "@/components/public/MuxPlayer";
import Markdown from "@/components/public/Markdown";
import AdSlot from "@/components/public/AdSlot";
import { pickAndTrackAdsForPlacement, type Ad } from "@/lib/ads";
import { formatDateInTimeZone } from "@/lib/dates";
import { buildPageMetadata, markdownToDescription } from "@/lib/metadata";
import { getPublishedStoryByIdOrSlug } from "@/lib/public-stories";
import { getCurrentDistrictKey } from "@/lib/districtServer";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const districtKey = getCurrentDistrictKey();
  const story = await getPublishedStoryByIdOrSlug(districtKey, params.id);

  if (!story) {
    return buildPageMetadata({
      districtKey,
      title: "Story not found",
      path: `/stories/${params.id}`,
    });
  }

  const storyPath = `/stories/${story.slug || story.id}`;

  return buildPageMetadata({
    districtKey,
    title: story.title,
    description: story.tease || markdownToDescription(story.body_markdown),
    path: storyPath,
    image: story.image_url,
    type: "article",
  });
}

export default async function StoryPage({ params }: { params: { id: string } }) {
  const districtKey = getCurrentDistrictKey();
  const story = await getPublishedStoryByIdOrSlug(districtKey, params.id);

  if (!story) {
    return (
      <main className="mx-auto max-w-site px-4 py-10">
        <p>Story not found.</p>
      </main>
    );
  }

  let storyAd: Ad | null = null;
  try {
    const service = createServiceClient();
    const picked = await pickAndTrackAdsForPlacement({
      supabase: service,
      districtKey,
      placement: "story",
      count: 1,
    });
    storyAd = picked[0] || null;
  } catch (error) {
    console.error("[StoryPage] Failed to load tracked ad", error);
  }

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
              {formatDateInTimeZone(story.published_at)}
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
