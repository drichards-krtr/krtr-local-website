import type { Metadata } from "next";
import SitePageContent from "@/components/public/SitePageContent";
import { buildPageMetadata, markdownToDescription } from "@/lib/metadata";
import { getSitePage } from "@/lib/site-pages";
import { getCurrentDistrictKey } from "@/lib/districtServer";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const districtKey = getCurrentDistrictKey();
  const page = await getSitePage(districtKey, "about");

  return buildPageMetadata({
    districtKey,
    title: page?.title || "About KRTR Local",
    description: markdownToDescription(page?.body_markdown),
    path: "/about",
  });
}

export default async function AboutPage() {
  return <SitePageContent slug="about" />;
}
