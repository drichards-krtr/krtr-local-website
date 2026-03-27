import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import type { DistrictKey } from "@/lib/districts";

export type SitePageSlug = "about" | "termsprivacy" | "advertise";

export type SitePageRecord = {
  title: string | null;
  body_markdown: string | null;
};

export const getSitePage = cache(async function getSitePage(
  districtKey: DistrictKey,
  slug: SitePageSlug
) {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("site_pages")
    .select("title, body_markdown")
    .eq("district_key", districtKey)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`[getSitePage:${districtKey}:${slug}] ${error.message}`);
  }

  return (data || null) as SitePageRecord | null;
});
