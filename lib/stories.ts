function slugifyPart(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildStorySlug(title: string, publishedAt?: string | null) {
  const safeTitle = slugifyPart(title || "story");
  const dateSource = publishedAt ? new Date(publishedAt) : new Date();
  const day = String(dateSource.getUTCDate()).padStart(2, "0");
  const month = dateSource
    .toLocaleString("en-US", { month: "long", timeZone: "UTC" })
    .toLowerCase();
  const year = String(dateSource.getUTCFullYear());
  return `${safeTitle}-${day}-${month}-${year}`;
}

export function storyHref(story: { id: string; slug?: string | null }) {
  return `/stories/${story.slug || story.id}`;
}
