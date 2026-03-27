import type { Metadata } from "next";
import SitePageContent from "@/components/public/SitePageContent";
import { buildPageMetadata, markdownToDescription } from "@/lib/metadata";
import { getSitePage } from "@/lib/site-pages";
import { getCurrentDistrictKey } from "@/lib/districtServer";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const districtKey = getCurrentDistrictKey();
  const page = await getSitePage(districtKey, "termsprivacy");

  return buildPageMetadata({
    districtKey,
    title: page?.title || "Terms and Privacy",
    description: markdownToDescription(page?.body_markdown),
    path: "/termsprivacy",
  });
}

export default async function TermsPrivacyPage() {
  return <SitePageContent slug="termsprivacy" />;
}
