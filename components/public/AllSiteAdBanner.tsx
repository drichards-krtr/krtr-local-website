import AdSlot from "@/components/public/AdSlot";
import { createPublicClient } from "@/lib/supabase/public";
import { pickWeightedAd, type Ad } from "@/lib/ads";

export default async function AllSiteAdBanner() {
  const supabase = createPublicClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("ads")
    .select("id, placement, image_url, link_url, html, weight")
    .eq("placement", "allsite")
    .eq("active", true)
    .lte("start_date", today)
    .gte("end_date", today);

  if (error) {
    console.error("[AllSiteAdBanner] Supabase query failed", error);
    return null;
  }

  const ad = pickWeightedAd((data || []) as Ad[]);
  if (!ad) return null;

  return (
    <div className="mx-auto max-w-site px-4 py-6">
      <AdSlot ad={ad} className="mx-auto block max-w-[900px]" />
    </div>
  );
}
