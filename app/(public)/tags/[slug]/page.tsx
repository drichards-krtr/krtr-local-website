import Link from "next/link";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import StoryRow from "@/components/public/StoryRow";
import {
  getTagBySlug,
  isTopLevelTag,
  getChildTags,
  getDescendantSlugs,
} from "@/lib/tags";
import { getCurrentDistrictKey } from "@/lib/districtServer";

export const dynamic = "force-dynamic";

type Story = {
  id: string;
  slug?: string | null;
  title: string;
  tease: string | null;
  image_url: string | null;
  published_at: string | null;
};

export default async function TagPage({ params }: { params: { slug: string } }) {
  const districtKey = getCurrentDistrictKey();
  const districtUcsdTag = districtKey === "dlpc" ? "ucsd" : districtKey === "vs" ? "vscsd" : "bcsd";
  const districtSchoolChildren =
    districtKey === "dlpc"
      ? ["lpc-elementary", "dg-elementary", "ums", "uhs"]
      : districtKey === "vs"
        ? ["tilford-elementary", "shellsburg-elementary", "vs-middle-school", "vs-high-school"]
        : [
            "atkins-elementary",
            "keystone-elementary",
            "norway-intermediate",
            "bc-middle-school",
            "bc-high-school",
          ];
  const tag = getTagBySlug(districtKey, params.slug);
  if (!tag) notFound();
  const isDistrictSchoolChildTag = districtSchoolChildren.includes(params.slug);

  const supabase = createPublicClient();
  const tagFilters = isTopLevelTag(districtKey, params.slug)
    ? getDescendantSlugs(districtKey, params.slug)
    : [params.slug];

  const { data, error } = await supabase
    .from("stories")
    .select("id, slug, title, tease, image_url, published_at")
    .eq("district_key", districtKey)
    .eq("status", "published")
    .overlaps("tags", tagFilters)
    .order("published_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("[TagPage] story query failed", { tag: params.slug, error });
    throw new Error(`[TagPage] ${error.message}`);
  }

  const stories = (data || []) as Story[];
  const childTags = isTopLevelTag(districtKey, params.slug)
    ? getChildTags(districtKey, params.slug)
    : isDistrictSchoolChildTag
      ? getChildTags(districtKey, districtUcsdTag)
      : [];

  return (
    <main className="mx-auto max-w-site px-4 py-6">
      {childTags.length > 0 && (
        <section className="mb-6 rounded-lg bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-600">
            {params.slug === districtUcsdTag
              ? "Dive into YOUR school..."
              : isDistrictSchoolChildTag
                ? "Switch Schools..."
                : `${tag.label} Sections`}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {childTags.map((child) => (
              <Link
                key={child.slug}
                href={`/tags/${child.slug}`}
                className="rounded-full border border-neutral-300 px-3 py-1 text-sm font-medium text-neutral-700 hover:border-krtrRed hover:text-krtrRed"
              >
                {child.label}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h1 className="mb-3 text-2xl font-semibold">{tag.label}</h1>
        {stories.length > 0 ? (
          <div className="grid gap-4">
            {stories.map((story) => (
              <StoryRow key={story.id} story={story} />
            ))}
          </div>
        ) : (
          <p className="rounded bg-white p-4 text-sm text-neutral-600">
            No published stories found for this tag yet.
          </p>
        )}
      </section>
    </main>
  );
}
