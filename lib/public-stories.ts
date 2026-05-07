import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import type { DistrictKey } from "@/lib/districts";

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

const DATED_SLUG_SUFFIX_PATTERN = /-\d{2}-[a-z]+-\d{4}$/;

function publishedAtVisibilityFilter() {
  return `published_at.is.null,published_at.lte.${new Date().toISOString()}`;
}

function getDatedSlugPrefix(slug: string) {
  const match = slug.match(DATED_SLUG_SUFFIX_PATTERN);
  if (!match?.index) return null;
  return slug.slice(0, match.index);
}

export const getPublishedStoryByIdOrSlug = cache(async function getPublishedStoryByIdOrSlug(
  districtKey: DistrictKey,
  idOrSlug: string,
) {
  const supabase = createPublicClient();

  const { data: storyBySlug, error: storyBySlugError } = await supabase
    .from("stories")
    .select(STORY_SELECT)
    .eq("district_key", districtKey)
    .eq("slug", idOrSlug)
    .eq("status", "published")
    .or(publishedAtVisibilityFilter())
    .maybeSingle();

  if (storyBySlugError) {
    throw new Error(
      `[getPublishedStoryByIdOrSlug:${districtKey}:slugLookup] ${storyBySlugError.message}`
    );
  }

  if (storyBySlug) {
    return storyBySlug as PublishedStory;
  }

  const datedSlugPrefix = getDatedSlugPrefix(idOrSlug);
  if (datedSlugPrefix) {
    const { data: storyByDatedSlugPrefix, error: storyByDatedSlugPrefixError } =
      await supabase
        .from("stories")
        .select(STORY_SELECT)
        .eq("district_key", districtKey)
        .like("slug", `${datedSlugPrefix}-%`)
        .eq("status", "published")
        .or(publishedAtVisibilityFilter())
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

    if (storyByDatedSlugPrefixError) {
      throw new Error(
        `[getPublishedStoryByIdOrSlug:${districtKey}:datedSlugPrefixLookup] ${storyByDatedSlugPrefixError.message}`
      );
    }

    if (storyByDatedSlugPrefix) {
      return storyByDatedSlugPrefix as PublishedStory;
    }
  }

  if (!UUID_PATTERN.test(idOrSlug)) {
    return null;
  }

  const { data: storyById, error: storyByIdError } = await supabase
    .from("stories")
    .select(STORY_SELECT)
    .eq("district_key", districtKey)
    .eq("id", idOrSlug)
    .eq("status", "published")
    .or(publishedAtVisibilityFilter())
    .maybeSingle();

  if (storyByIdError) {
    throw new Error(
      `[getPublishedStoryByIdOrSlug:${districtKey}:idLookup] ${storyByIdError.message}`
    );
  }

  return (storyById || null) as PublishedStory | null;
});
