import { KRTR_TIMEZONE } from "@/lib/dates";

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
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KRTR_TIMEZONE,
    year: "numeric",
    month: "long",
    day: "2-digit",
  }).formatToParts(dateSource);
  const day = parts.find((part) => part.type === "day")?.value || "01";
  const month = (parts.find((part) => part.type === "month")?.value || "january").toLowerCase();
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  return `${safeTitle}-${day}-${month}-${year}`;
}

export function storyHref(story: { id: string; slug?: string | null }) {
  return `/stories/${story.slug || story.id}`;
}
