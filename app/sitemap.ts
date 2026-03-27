import type { MetadataRoute } from "next";
import { getCurrentDistrict } from "@/lib/districtServer";
import { absoluteUrl } from "@/lib/metadata";
import { createPublicClient } from "@/lib/supabase/public";
import { getAllTagSlugs } from "@/lib/tags";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const district = getCurrentDistrict();
  const supabase = createPublicClient();
  const now = new Date();

  const staticRoutes = ["/", "/about", "/advertise", "/termsprivacy", "/calendar", "/weather", "/watch-live"];
  if (district.features.vote) staticRoutes.push("/vote");
  if (district.features.nominations) staticRoutes.push("/nominations");
  if (district.features.festivalOfTrails) staticRoutes.push("/festival-of-trails");

  const entries: MetadataRoute.Sitemap = staticRoutes.map((path) => ({
    url: absoluteUrl(path, district.key),
    lastModified: now,
    changeFrequency: path === "/" ? "hourly" : "daily",
    priority: path === "/" ? 1 : 0.7,
  }));

  for (const slug of getAllTagSlugs(district.key)) {
    entries.push({
      url: absoluteUrl(`/tags/${slug}`, district.key),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.6,
    });
  }

  const { data: stories } = await supabase
    .from("stories")
    .select("id, slug, updated_at, published_at")
    .eq("district_key", district.key)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(5000);

  for (const story of stories || []) {
    const storyIdOrSlug = story.slug || story.id;
    entries.push({
      url: absoluteUrl(`/stories/${storyIdOrSlug}`, district.key),
      lastModified: story.updated_at || story.published_at || now,
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }

  return entries;
}
