import { createPublicClient } from "@/lib/supabase/public";
import { getCurrentDistrict } from "@/lib/districtServer";
import { absoluteUrl, markdownToDescription } from "@/lib/metadata";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const district = await getCurrentDistrict();
  const supabase = createPublicClient();
  const publishVisibilityFilter = `published_at.is.null,published_at.lte.${new Date().toISOString()}`;
  const { data: stories, error } = await supabase
    .from("stories")
    .select("id, slug, title, tease, body_markdown, published_at")
    .eq("district_key", district.key)
    .eq("status", "published")
    .or(publishVisibilityFilter)
    .order("published_at", { ascending: false })
    .limit(50);

  if (error) {
    return new Response("Feed unavailable", { status: 500 });
  }

  const itemsXml = (
    await Promise.all((stories || [])
      .map(async (story) => {
      const storyPath = `/stories/${story.slug || story.id}`;
      const description = markdownToDescription(story.tease || story.body_markdown || "") || district.metadata.defaultDescription;
      const storyUrl = await absoluteUrl(storyPath, district.key);
      return `\n      <item>\n        <title>${escapeXml(story.title)}</title>\n        <link>${escapeXml(storyUrl)}</link>\n        <guid>${escapeXml(storyUrl)}</guid>\n        <pubDate>${new Date(story.published_at || Date.now()).toUTCString()}</pubDate>\n        <description>${escapeXml(description)}</description>\n      </item>`;
    }))
  )
    .join("");
  const feedUrl = await absoluteUrl("/", district.key);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(district.metadata.siteName)}</title>
    <link>${escapeXml(feedUrl)}</link>
    <description>${escapeXml(district.metadata.defaultDescription)}</description>${itemsXml}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
