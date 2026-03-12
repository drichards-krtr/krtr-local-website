import type { Metadata } from "next";
import SitePageContent from "@/components/public/SitePageContent";
import { buildPageMetadata, markdownToDescription } from "@/lib/metadata";
import { getSitePage } from "@/lib/site-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getSitePage("advertise");

  return buildPageMetadata({
    title: page?.title || "Advertise with KRTR Local",
    description: markdownToDescription(page?.body_markdown),
    path: "/advertise",
  });
}

export default async function AdvertisePage() {
  return <SitePageContent slug="advertise" />;
}
