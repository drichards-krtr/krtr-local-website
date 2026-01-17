import Link from "next/link";

type Story = {
  id: string;
  title: string;
  tease: string | null;
  image_url: string | null;
  published_at: string | null;
};

export default function StoryRow({ story }: { story: Story }) {
  return (
    <article className="grid gap-4 rounded-lg border border-black/5 bg-white p-4 md:grid-cols-[180px_1fr]">
      {story.image_url ? (
        <Link
          href={`/stories/${story.id}`}
          className="block aspect-video overflow-hidden rounded"
        >
          <img
            src={story.image_url}
            alt=""
            className="h-full w-full object-cover"
          />
        </Link>
      ) : (
        <div className="block aspect-video rounded bg-neutral-100" />
      )}
      <div className="grid content-start gap-2">
        <h3 className="text-lg font-semibold">
          <Link href={`/stories/${story.id}`} className="hover:underline">
            {story.title || "(Untitled)"}
          </Link>
        </h3>
        {story.published_at && (
          <time
            className="text-sm text-muted"
            dateTime={story.published_at}
          >
            {new Date(story.published_at).toLocaleDateString()}
          </time>
        )}
        {story.tease && <p className="text-sm text-neutral-700">{story.tease}</p>}
        <Link
          href={`/stories/${story.id}`}
          className="text-sm font-semibold text-krtrRed hover:underline"
        >
          Read more
        </Link>
      </div>
    </article>
  );
}
