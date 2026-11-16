import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { notFound } from "next/navigation";
import { getPublishedStoryByIdOrSlug } from "@/lib/public-stories";
import { getDistrictConfig, getFallbackDistrictKey, isSiteScopeKey, type DistrictKey } from "@/lib/districts";
import { invalidatePublicScope } from "@/lib/publicCache";

export function getArticleScope(scope: string) {
  if (!isSiteScopeKey(scope)) notFound();
  const districtKey = getFallbackDistrictKey(scope);
  return { scope, districtKey, origin: scope === "global" ? "https://krtrlocal.tv" : `https://${getDistrictConfig(districtKey).host}` };
}

const articleTag = (district: DistrictKey) => `articles:${district}`;
class ArticleNotVisible extends Error {}

export const getCachedArticle = cache(async (district: DistrictKey, id: string) => {
  try {
    return await unstable_cache(async () => {
      const story = await getPublishedStoryByIdOrSlug(district, id);
      // Never persist a missing/scheduled result in the indefinite data cache.
      if (!story) throw new ArticleNotVisible();
      return story;
    }, ["published-article-v1", district, id], { tags: [articleTag(district)], revalidate: false })();
  } catch (error) {
    if (!(error instanceof ArticleNotVisible)) throw error;
    // Only negative page output has a short ISR lifetime. This also handles schedules
    // without a cron job: after the boundary the next regeneration finds the story.
    await unstable_cache(async () => true, ["article-missing-v1", district, id], {
      tags: [articleTag(district)], revalidate: 60,
    })();
    return null;
  }
});

export function invalidateArticleDistrict(district: DistrictKey) {
  invalidatePublicScope(district);
  // A district tag deliberately covers ID URLs, historical aliases, fuzzy dated
  // slugs and cached 404s, so a rename/withdrawal cannot leave a stale variant.
  revalidateTag(articleTag(district), { expire: 0 });
}
