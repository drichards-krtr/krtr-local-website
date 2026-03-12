import { cache } from "react";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";

const SITE_NAME = "KRTR Local";
const DEFAULT_DESCRIPTION =
  "Local news, sports, and community stories from Dysart, La Porte City and Union CSD.";

type PageMetadataInput = {
  title?: string | null;
  description?: string | null;
  path?: string;
  image?: string | null;
  type?: "website" | "article";
};

type ActiveLogo = {
  image_url: string | null;
};

export function getSiteUrl() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL;

  if (!configuredUrl) {
    return null;
  }

  const normalizedUrl = configuredUrl.startsWith("http")
    ? configuredUrl
    : `https://${configuredUrl}`;

  try {
    return new URL(normalizedUrl);
  } catch {
    return null;
  }
}

export function getMetadataBase() {
  return getSiteUrl() || new URL("https://krtrlocal.tv");
}

export function absoluteUrl(path = "/") {
  return new URL(path, getMetadataBase()).toString();
}

const getActiveLogoImage = cache(async function getActiveLogoImage() {
  const supabase = createPublicClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("logos")
    .select("image_url")
    .eq("active", true)
    .lte("start_date", today)
    .gte("end_date", today)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[metadata:getActiveLogoImage] Supabase query failed", error);
    return null;
  }

  return (data as ActiveLogo | null)?.image_url || null;
});

export function markdownToDescription(markdown: string | null | undefined, maxLength = 180) {
  if (!markdown) {
    return null;
  }

  const plainText = markdown
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, " ")
    .replace(/[`*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!plainText) {
    return null;
  }

  return plainText.length <= maxLength
    ? plainText
    : `${plainText.slice(0, maxLength - 1).trimEnd()}...`;
}

export async function buildPageMetadata({
  title,
  description,
  path = "/",
  image,
  type = "website",
}: PageMetadataInput = {}): Promise<Metadata> {
  const resolvedTitle = title?.trim() || SITE_NAME;
  const resolvedDescription = description?.trim() || DEFAULT_DESCRIPTION;
  const resolvedImage = image || (await getActiveLogoImage());
  const url = absoluteUrl(path);

  return {
    metadataBase: getMetadataBase(),
    title: resolvedTitle,
    description: resolvedDescription,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type,
      siteName: SITE_NAME,
      title: resolvedTitle,
      description: resolvedDescription,
      url,
      images: resolvedImage ? [{ url: resolvedImage, alt: resolvedTitle }] : undefined,
    },
    twitter: {
      card: resolvedImage ? "summary_large_image" : "summary",
      title: resolvedTitle,
      description: resolvedDescription,
      images: resolvedImage ? [resolvedImage] : undefined,
    },
  };
}

export { DEFAULT_DESCRIPTION, SITE_NAME };
