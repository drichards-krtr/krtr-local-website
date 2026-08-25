import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MuxPlayer from "@/components/public/MuxPlayer";
import { dailyHref, getPublishedDailyBySlug } from "@/lib/dailys";
import { formatDateInTimeZone } from "@/lib/dates";
import { getCurrentDistrictKey } from "@/lib/districtServer";
import { buildPageMetadata } from "@/lib/metadata";
import { syncDailyVideoState } from "@/lib/mux";

export const dynamic = "force-dynamic";

function getDailyPreviewImage(daily: {
  image_url: string | null;
  mux_playback_id: string | null;
}) {
  if (daily.image_url) return daily.image_url;
  if (daily.mux_playback_id) {
    return `https://image.mux.com/${daily.mux_playback_id}/thumbnail.jpg?time=0`;
  }
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const districtKey = await getCurrentDistrictKey();
  const daily = await getPublishedDailyBySlug(districtKey, params.slug);

  if (!daily) {
    return buildPageMetadata({
      districtKey,
      title: "Not found",
      path: `/${params.slug}`,
    });
  }

  return buildPageMetadata({
    districtKey,
    title: daily.title,
    path: dailyHref(daily),
    image: getDailyPreviewImage(daily),
    type: "article",
  });
}

export default async function DailyPage({ params }: { params: { slug: string } }) {
  const districtKey = await getCurrentDistrictKey();
  const daily = await getPublishedDailyBySlug(districtKey, params.slug);

  if (!daily) {
    notFound();
  }

  const syncedVideo =
    daily.mux_playback_id ? null : await syncDailyVideoState(daily.id).catch(() => null);
  const playbackId = syncedVideo?.mux_playback_id || daily.mux_playback_id;

  return (
    <main className="mx-auto max-w-site px-4 py-6">
      <article className="rounded-lg bg-white p-6">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">{daily.title}</h1>
          {daily.published_at && (
            <time className="text-sm text-muted" dateTime={daily.published_at}>
              {formatDateInTimeZone(daily.published_at)}
            </time>
          )}
        </header>
        {playbackId ? (
          <MuxPlayer
            playbackId={playbackId}
            poster={daily.image_url || undefined}
            orientation={daily.video_orientation}
          />
        ) : daily.image_url ? (
          <img
            src={daily.image_url}
            alt=""
            className="mx-auto mb-4 block h-auto max-h-[300px] w-auto max-w-[calc(100%-2px)] rounded-lg"
          />
        ) : null}
      </article>
    </main>
  );
}
