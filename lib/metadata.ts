import { cache } from "react";
import type { Metadata } from "next";
import { getDistrictConfig, type DistrictKey } from "@/lib/districts";
import { getCurrentDistrictKey, getRequestOrigin } from "@/lib/districtServer";
import { getPreferredLogo } from "@/lib/logos";

type PageMetadataInput = {
  districtKey?: DistrictKey;
  title?: string | null;
  description?: string | null;
  path?: string;
  image?: string | null;
  type?: "website" | "article";
};

export function getSiteUrl(districtKey?: DistrictKey) {
  const requestOrigin = getRequestOrigin();
  if (requestOrigin) {
    try {
      return new URL(requestOrigin);
    } catch {
      // Fall through to env-based fallback below.
    }
  }

  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL;

  if (configuredUrl) {
    const normalizedUrl = configuredUrl.startsWith("http")
      ? configuredUrl
      : `https://${configuredUrl}`;

    try {
      return new URL(normalizedUrl);
    } catch {
      // Fall through to district host fallback below.
    }
  }

  const resolvedDistrictKey = districtKey || getCurrentDistrictKey();
  return new URL(`https://${getDistrictConfig(resolvedDistrictKey).host}`);
}

export function getMetadataBase(districtKey?: DistrictKey) {
  return getSiteUrl(districtKey);
}

export function absoluteUrl(path = "/", districtKey?: DistrictKey) {
  return new URL(path, getMetadataBase(districtKey)).toString();
}

const getActiveLogoImage = cache(async function getActiveLogoImage(districtKey: DistrictKey) {
  const logo = await getPreferredLogo(districtKey);
  return logo?.image_url || null;
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
  districtKey,
  title,
  description,
  path = "/",
  image,
  type = "website",
}: PageMetadataInput = {}): Promise<Metadata> {
  const resolvedDistrictKey = districtKey || getCurrentDistrictKey();
  const district = getDistrictConfig(resolvedDistrictKey);
  const resolvedTitle = title?.trim() || district.metadata.siteName;
  const resolvedDescription =
    description?.trim() || district.metadata.defaultDescription;
  const resolvedImage = image || (await getActiveLogoImage(resolvedDistrictKey));
  const url = absoluteUrl(path, resolvedDistrictKey);

  return {
    metadataBase: getMetadataBase(resolvedDistrictKey),
    title: resolvedTitle,
    description: resolvedDescription,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type,
      siteName: district.metadata.siteName,
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
