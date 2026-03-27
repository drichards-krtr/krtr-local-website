import { getDistrictConfig, type DistrictKey, type DistrictTagNode } from "@/lib/districts";

export type TagSlug = string;
export type TagNode = DistrictTagNode;

export function getTagTree(districtKey: DistrictKey) {
  return getDistrictConfig(districtKey).tags;
}

export function getAllTagSlugs(districtKey: DistrictKey): TagSlug[] {
  return getTagTree(districtKey).flatMap((tag) => [
    tag.slug,
    ...(tag.children?.map((child) => child.slug) || []),
  ]);
}

export function getTopLevelTags(districtKey: DistrictKey) {
  return getTagTree(districtKey);
}

export function getTagBySlug(districtKey: DistrictKey, slug: string) {
  for (const topLevelTag of getTagTree(districtKey)) {
    if (topLevelTag.slug === slug) return topLevelTag;
    const childMatch = topLevelTag.children?.find((child) => child.slug === slug);
    if (childMatch) return childMatch;
  }
  return null;
}

export function isTopLevelTag(districtKey: DistrictKey, slug: string) {
  return getTagTree(districtKey).some((tag) => tag.slug === slug);
}

export function getChildTags(districtKey: DistrictKey, parentSlug: string) {
  return getTagTree(districtKey).find((tag) => tag.slug === parentSlug)?.children || [];
}

export function getDescendantSlugs(districtKey: DistrictKey, slug: string): string[] {
  const topLevel = getTagTree(districtKey).find((tag) => tag.slug === slug);
  if (topLevel) {
    return [topLevel.slug, ...(topLevel.children?.map((child) => child.slug) || [])];
  }
  return [slug];
}
