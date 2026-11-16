import type { Metadata } from "next";
import { getPublishedDailyBySlug, dailyHref } from "@/lib/dailys";
import { buildPageMetadata } from "@/lib/metadata";
import Content from "@/components/public/pages/DailyPage";
import { getCurrentDistrictKey } from "@/lib/districtServer";
export const dynamic = "force-dynamic";
export default async function Page(props: {params: Promise<{slug:string}>}) {
 return <Content districtKey={await getCurrentDistrictKey()} params={props.params} />;
}

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
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const districtKey = await getCurrentDistrictKey();
  const daily = await getPublishedDailyBySlug(districtKey, slug);

  if (!daily) {
    return buildPageMetadata({
      districtKey,
      title: "Not found",
      path: `/${slug}`,
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
