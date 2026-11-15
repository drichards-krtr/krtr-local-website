import { getCachedArticle, getArticleScope } from "@/lib/articleCache";
import ArticleChrome from "@/components/public/ArticleChrome";
import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import MuxPlayer from "@/components/public/MuxPlayer";
import Markdown from "@/components/public/Markdown";
import { formatDateInTimeZone } from "@/lib/dates";
import { buildPageMetadata, markdownToDescription } from "@/lib/metadata";
import NrcsArticleMedia from "@/components/cms/NrcsArticleMedia";
import { sanitizePublicationHtml } from "@/lib/nrcsPublication";
import { htmlToDescription } from "@/lib/storyDescription";

// Empty params opts into on-demand ISR; no production data is read at build time.
export const dynamic = "force-static";
export const revalidate = false;
export function generateStaticParams() { return []; }

function getStoryPreviewImage(story: {
  image_url: string | null;
  mux_playback_id: string | null;
  article_media?: Array<{ url?: string | null }> | null;
}) {
  if (story.image_url) return story.image_url;
  const articleImage = story.article_media?.find(
    (asset) => typeof asset?.url === "string" && asset.url.trim()
  )?.url?.trim();
  if (articleImage) return articleImage;
  if (story.mux_playback_id) {
    return `https://image.mux.com/${story.mux_playback_id}/thumbnail.jpg?time=0`;
  }
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ scope: string; id: string }>;
}): Promise<Metadata> {
  const { id, scope } = await params;
  const { districtKey, origin } = getArticleScope(scope);
  const story = await getCachedArticle(districtKey, id);

  if (!story) {
    return buildPageMetadata({
      districtKey, origin,
      title: "Story not found",
      path: `/stories/${id}`,
    });
  }

  const storyPath = `/stories/${story.slug || story.id}`;

  return buildPageMetadata({
    districtKey, origin,
    title: story.seo_title || story.title,
    description: story.seo_description || story.tease || (story.editorial_origin === "nrcs" ? htmlToDescription(story.body_html) : markdownToDescription(story.body_markdown)),
    path: storyPath,
    image: getStoryPreviewImage(story),
    type: "article",
  });
}

export default async function StoryPage({ params }: { params: Promise<{ scope: string; id: string }> }) {
  const { id, scope } = await params;
  const { districtKey, origin } = getArticleScope(scope);
  const story = await getCachedArticle(districtKey, id);

  if (!story) notFound();

  if (story.slug && id !== story.slug) {
    redirect(`/stories/${story.slug}`);
  }

  const playbackId = story.mux_playback_id;
  const nrcsArticle = story.editorial_origin === "nrcs" && typeof story.body_html === "string";
  const fallbackImage = !playbackId && !nrcsArticle ? story.image_url : null;

  return (
    <ArticleChrome key={`${scope}:${id}`} scope={scope}>
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
        {fallbackImage && (
          <img
            src={fallbackImage}
            alt=""
            className="mb-4 mx-auto block h-auto max-h-[300px] w-auto max-w-[calc(100%-2px)] rounded-lg"
          />
        )}
        {playbackId && (
          <MuxPlayer
            playbackId={playbackId}
            poster={story.image_url || undefined}
            orientation={story.video_orientation}
          />
        )}
        {nrcsArticle ? <><NrcsArticleMedia images={story.article_media || []} /><div className="rich-text break-words" dangerouslySetInnerHTML={{ __html: sanitizePublicationHtml(story.body_html || "") }} /></> : <Markdown content={story.body_markdown || ""} />}
      </article>

    </main>
    </ArticleChrome>
  );
}
