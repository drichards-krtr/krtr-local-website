import { cache } from "react";
import { getDistrictConfig, isExplicitDistrictHost, type DistrictKey } from "@/lib/districts";
import { getRequestHost } from "@/lib/districtServer";
import { createPublicClient } from "@/lib/supabase/public";

export type SocialLinkSettings = {
  facebook_url: string;
  instagram_url: string;
  youtube_url: string;
  watch_live_enabled: boolean;
};

export const getSocialLinkSettings = cache(async function getSocialLinkSettings(
  districtKey: DistrictKey
): Promise<SocialLinkSettings> {
  const district = getDistrictConfig(districtKey);
  const fallback: SocialLinkSettings = {
    facebook_url: district.socialNav.facebookUrl,
    instagram_url: district.socialNav.instagramUrl,
    youtube_url: district.socialNav.youtubeUrl,
    watch_live_enabled: district.socialNav.watchLiveEnabled,
  };

  if (!isExplicitDistrictHost(getRequestHost())) {
    return fallback;
  }

  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("social_links")
    .select("facebook_url, instagram_url, youtube_url, watch_live_enabled")
    .eq("district_key", districtKey)
    .maybeSingle();

  if (error) {
    console.error("[socialLinks:getSocialLinkSettings] Supabase query failed", {
      districtKey,
      error,
    });
    return fallback;
  }

  return {
    facebook_url: data?.facebook_url || fallback.facebook_url,
    instagram_url: data?.instagram_url || fallback.instagram_url,
    youtube_url: data?.youtube_url || fallback.youtube_url,
    watch_live_enabled:
      typeof data?.watch_live_enabled === "boolean"
        ? data.watch_live_enabled
        : fallback.watch_live_enabled,
  };
});
