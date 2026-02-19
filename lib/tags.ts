export type TagSlug =
  | "dysart"
  | "la-porte-city"
  | "ucsd"
  | "lpc-elementary"
  | "dg-elementary"
  | "ums"
  | "uhs"
  | "sports";

export type TagNode = {
  slug: TagSlug;
  label: string;
  children?: TagNode[];
};

export const TAG_TREE: TagNode[] = [
  { slug: "dysart", label: "Dysart" },
  { slug: "la-porte-city", label: "La Porte City" },
  {
    slug: "ucsd",
    label: "UCSD",
    children: [
      { slug: "lpc-elementary", label: "LPC Elementary" },
      { slug: "dg-elementary", label: "DG Elementary" },
      { slug: "ums", label: "UMS" },
      { slug: "uhs", label: "UHS" },
    ],
  },
  { slug: "sports", label: "Sports" },
];

export const ALL_TAG_SLUGS: TagSlug[] = TAG_TREE.flatMap((tag) => [
  tag.slug,
  ...(tag.children?.map((child) => child.slug) || []),
]);

export function getTopLevelTags() {
  return TAG_TREE;
}

export function getTagBySlug(slug: string) {
  for (const topLevelTag of TAG_TREE) {
    if (topLevelTag.slug === slug) return topLevelTag;
    const childMatch = topLevelTag.children?.find((child) => child.slug === slug);
    if (childMatch) return childMatch;
  }
  return null;
}

export function isTopLevelTag(slug: string) {
  return TAG_TREE.some((tag) => tag.slug === slug);
}

export function getChildTags(parentSlug: string) {
  return TAG_TREE.find((tag) => tag.slug === parentSlug)?.children || [];
}

export function getDescendantSlugs(slug: string): string[] {
  const topLevel = TAG_TREE.find((tag) => tag.slug === slug);
  if (topLevel) {
    return [topLevel.slug, ...(topLevel.children?.map((child) => child.slug) || [])];
  }
  return [slug];
}
