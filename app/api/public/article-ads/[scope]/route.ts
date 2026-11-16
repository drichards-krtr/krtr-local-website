import { NextResponse } from "next/server";
import { getArticleScope } from "@/lib/articleCache";
import { createServiceClient } from "@/lib/supabase/admin";
import { pickAndTrackAdsForPlacement } from "@/lib/ads";

export async function POST(request: Request, { params }: { params: Promise<{ scope: string }> }) {
  const { districtKey } = getArticleScope((await params).scope);
  try {
    const supabase = createServiceClient();
    const selected = new URL(request.url).searchParams.get("placement") || "story";
    if (!["story", "homepage", "none"].includes(selected)) return NextResponse.json({ error: "Invalid placement" }, { status: 400 });
    const [allsite, extra] = await Promise.all([
      pickAndTrackAdsForPlacement({ supabase, districtKey, placement: "allsite", count: 1 }),
      selected === "none" ? Promise.resolve([]) : pickAndTrackAdsForPlacement({ supabase, districtKey, placement: selected as "story" | "homepage", count: selected === "homepage" ? 3 : 1 }),
    ]);
    return NextResponse.json({ allsite: allsite[0] || null, story: selected === "story" ? extra[0] || null : null, homepage: selected === "homepage" ? extra : [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[ArticleAds] Failed to load ads", error);
    return NextResponse.json({ error: "Ads unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
