import AdSlot from "@/components/public/AdSlot";
import { createServiceClient } from "@/lib/supabase/admin";
import { pickAndTrackAdsForPlacement } from "@/lib/ads";
import { getCurrentDistrictKey } from "@/lib/districtServer";

export default async function AllSiteAdBanner() {
  try {
    const supabase = createServiceClient();
    const districtKey = getCurrentDistrictKey();
    const [ad] = await pickAndTrackAdsForPlacement({
      supabase,
      districtKey,
      placement: "allsite",
      count: 1,
    });
    if (!ad) return null;
    return (
      <div className="mx-auto max-w-site px-4 py-6">
        <AdSlot ad={ad} className="mx-auto block max-w-[900px]" />
      </div>
    );
  } catch (error) {
    console.error("[AllSiteAdBanner] Failed to load tracked ad", error);
    return null;
  }
}
