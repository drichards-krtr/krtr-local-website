import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";

export type SitePageSlug = "about" | "termsprivacy" | "advertise";

export type SitePageRecord = {
  title: string | null;
  body_markdown: string | null;
};

export const getSitePage = cache(async function getSitePage(slug: SitePageSlug) {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("site_pages")
    .select("title, body_markdown")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`[getSitePage:${slug}] ${error.message}`);
  }

  return (data || null) as SitePageRecord | null;
});
