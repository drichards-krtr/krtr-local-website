import type { Metadata } from "next";
import SitePageContent from "@/components/public/SitePageContent";
import { buildPageMetadata, markdownToDescription } from "@/lib/metadata";
import { getSitePage } from "@/lib/site-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getSitePage("termsprivacy");

  return buildPageMetadata({
    title: page?.title || "Terms and Privacy",
    description: markdownToDescription(page?.body_markdown),
    path: "/termsprivacy",
  });
}

export default async function TermsPrivacyPage() {
  return <SitePageContent slug="termsprivacy" />;
}
