import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PublishedStory = {
  id: string;
  slug: string | null;
  title: string;
  tease: string | null;
  body_markdown: string | null;
  published_at: string | null;
  image_url: string | null;
  mux_playback_id: string | null;
};

const STORY_SELECT =
  "id, slug, title, tease, body_markdown, published_at, image_url, mux_playback_id";

export const getPublishedStoryByIdOrSlug = cache(async function getPublishedStoryByIdOrSlug(
  idOrSlug: string,
) {
  const supabase = createPublicClient();

  const { data: storyBySlug, error: storyBySlugError } = await supabase
    .from("stories")
    .select(STORY_SELECT)
    .eq("slug", idOrSlug)
    .eq("status", "published")
    .maybeSingle();

  if (storyBySlugError) {
    throw new Error(`[getPublishedStoryByIdOrSlug:slugLookup] ${storyBySlugError.message}`);
  }

  if (storyBySlug) {
    return storyBySlug as PublishedStory;
  }

  if (!UUID_PATTERN.test(idOrSlug)) {
    return null;
  }

  const { data: storyById, error: storyByIdError } = await supabase
    .from("stories")
    .select(STORY_SELECT)
    .eq("id", idOrSlug)
    .eq("status", "published")
    .maybeSingle();

  if (storyByIdError) {
    throw new Error(`[getPublishedStoryByIdOrSlug:idLookup] ${storyByIdError.message}`);
  }

  return (storyById || null) as PublishedStory | null;
});
