import { revalidateTag, revalidatePath as nextRevalidatePath, unstable_cache } from "next/cache";
import { DISTRICT_KEYS, type SiteScopeKey } from "@/lib/districts";

export const publicScopeTag = (scope: SiteScopeKey) => `public-pages:${scope}`;
export const chromeScopeTag = (scope: SiteScopeKey) => `public-chrome:${scope}`;

export function invalidatePublicScope(scope: SiteScopeKey) {
  revalidateTag(publicScopeTag(scope), { expire: 0 });
  revalidateTag(chromeScopeTag(scope), { expire: 0 });
  if (scope === "dlpc") invalidatePublicScope("global");
}

export function invalidateAllPublicPages() {
  for (const scope of DISTRICT_KEYS) invalidatePublicScope(scope);
}

// CMS mutations already call revalidatePath after their database writes. Also
// expire the tags used by host-scoped output, whose internal paths differ.
export function revalidatePath(path: string, type?: "page" | "layout") {
  invalidateAllPublicPages();
  nextRevalidatePath(path, type);
}

export async function dependOnPublicScope(scope: SiteScopeKey, timed: boolean) {
  // No indefinitely cached query results: regeneration reads current database
  // state. Timed views recover from missed invalidations and clock boundaries.
  await unstable_cache(async () => true, ["public-output-v2", scope, String(timed)], {
    tags: [publicScopeTag(scope)], revalidate: timed ? 60 : false,
  })();
}
