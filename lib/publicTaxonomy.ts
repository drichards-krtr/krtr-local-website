export type PublicTag = { id: string; name: string; slug: string; aliases?: string[] };

export function findPublicTag(value: unknown, slug: string): PublicTag | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const tag = item as PublicTag;
    if (typeof tag.name !== "string" || typeof tag.slug !== "string") continue;
    if (tag.slug === slug || Array.isArray(tag.aliases) && tag.aliases.includes(slug)) return tag;
  }
  return null;
}
