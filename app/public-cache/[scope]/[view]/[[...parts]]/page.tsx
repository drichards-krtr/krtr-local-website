import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getArticleScope } from "@/lib/articleCache";
import { dependOnPublicScope } from "@/lib/publicCache";
import { decodePublicQuery } from "@/lib/publicCacheRouting";
import { buildPageMetadata, markdownToDescription } from "@/lib/metadata";
import { getSitePage, type SitePageSlug } from "@/lib/site-pages";
import { getPublishedDailyBySlug } from "@/lib/dailys";
import SiteIdentity from "@/components/public/SiteIdentity";
import ArticleChrome from "@/components/public/ArticleChrome";
import HomePageContent from "@/components/public/HomePageContent";
import SitePageContent from "@/components/public/SitePageContent";
import CalendarPage from "@/components/public/pages/CalendarPage";
import TagPage from "@/components/public/pages/TagPage";
import GarageSalesPage from "@/components/public/pages/GarageSalesPage";
import FestivalPage from "@/components/public/pages/FestivalPage";
import VotePage from "@/components/public/pages/VotePage";
import WeatherPage from "@/components/public/pages/WeatherPage";
import WatchLivePage from "@/components/public/pages/WatchLivePage";
import DailyPage from "@/components/public/pages/DailyPage";

export const dynamic = "force-static";
// Cache page output, not untagged database responses. Each regeneration must
// reread current records after an editorial invalidation or time boundary.
export const fetchCache = "force-no-store";
export const revalidate = false;
export function generateStaticParams() { return []; }

type RouteParams = { scope: string; view: string; parts?: string[] };
type Props = { params: Promise<RouteParams> };
const informationViews = new Set(["about", "advertise", "termsprivacy"]);
const titles: Record<string, string> = { calendar: "Community Calendar", "garage-sales": "Garage Sales", vote: "VOTE", "festival-of-trails": "Festival of Trails", weather: "Weather", "watch-live": "Watch Live" };

async function resolve(params: Promise<RouteParams>) {
  const route = await params;
  const identity = getArticleScope(route.scope);
  const parts = route.parts || [];
  if (parts.length > 1 || (["tag", "daily"].includes(route.view) && !parts[0])) notFound();
  const timed = !informationViews.has(route.view) && !["festival-of-trails", "vote"].includes(route.view);
  await dependOnPublicScope(identity.scope, timed);
  return { ...route, ...identity, parts };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { view, districtKey, origin, parts } = await resolve(params);
  if (informationViews.has(view)) {
    const page = await getSitePage(districtKey, view as SitePageSlug);
    return buildPageMetadata({ districtKey, origin, title: page?.title, description: markdownToDescription(page?.body_markdown), path: `/${view}` });
  }
  if (view === "daily") {
    const daily = await getPublishedDailyBySlug(districtKey, parts[0]);
    return buildPageMetadata({ districtKey, origin, title: daily?.title || "Not found", path: `/${parts[0]}`, type: "article", image: daily?.image_url || (daily?.mux_playback_id ? `https://image.mux.com/${daily.mux_playback_id}/thumbnail.jpg?time=0` : null) });
  }
  return buildPageMetadata({ districtKey, origin, title: titles[view], path: view === "home" ? "/" : view === "tag" ? `/tags/${parts[0]}` : `/${view}` });
}

export default async function CachedPublicPage({ params }: Props) {
  const { scope, view, districtKey, origin, parts } = await resolve(params);
  let content;
  if (view === "home") content = <HomePageContent siteScopeKey={districtKey} deferAds />;
  else if (informationViews.has(view)) content = <SitePageContent slug={view as SitePageSlug} districtKey={districtKey} />;
  else if (view === "tag") content = <TagPage districtKey={districtKey} params={Promise.resolve({ slug: parts[0] })} />;
  else if (view === "calendar") content = <CalendarPage districtKey={districtKey} searchParams={Promise.resolve(decodePublicQuery(parts[0]))} />;
  else if (view === "garage-sales") content = <GarageSalesPage districtKey={districtKey} searchParams={Promise.resolve(decodePublicQuery(parts[0]))} />;
  else if (view === "festival-of-trails") content = <FestivalPage districtKey={districtKey} />;
  else if (view === "vote") content = <VotePage districtKey={districtKey} />;
  else if (view === "weather") content = <WeatherPage districtKey={districtKey} />;
  else if (view === "watch-live") content = <WatchLivePage districtKey={districtKey} />;
  else if (view === "daily") content = <DailyPage districtKey={districtKey} params={Promise.resolve({ slug: parts[0] })} />;
  else notFound();
  return <><SiteIdentity districtKey={districtKey} origin={origin} /><ArticleChrome key={`${scope}:${view}:${parts.join("/")}`} scope={scope} placement={view === "home" ? "homepage" : "none"}>{content}</ArticleChrome></>;
}
