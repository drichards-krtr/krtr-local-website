import { NextResponse } from "next/server";
import { getArticleScope } from "@/lib/articleCache";
import { createServiceClient } from "@/lib/supabase/admin";
import { pickAndTrackAdsForPlacement } from "@/lib/ads";

export async function POST(_request: Request, { params }: { params: Promise<{ scope: string }> }) {
  const { districtKey } = getArticleScope((await params).scope);
  try {
    const supabase = createServiceClient();
    const [allsite, story] = await Promise.all(["allsite", "story"].map(placement =>
      pickAndTrackAdsForPlacement({ supabase, districtKey, placement: placement as "allsite" | "story", count: 1 })));
    return NextResponse.json({ allsite: allsite[0] || null, story: story[0] || null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[ArticleAds] Failed to load ads", error);
    return NextResponse.json({ error: "Ads unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
