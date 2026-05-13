import { cache } from "react";
import {
  getDistrictConfig,
  getFallbackDistrictKey,
  type SiteScopeKey,
} from "@/lib/districts";
import { getCurrentSiteScopeKey } from "@/lib/districtServer";
import { createPublicClient } from "@/lib/supabase/public";

export type SocialLinkSettings = {
  facebook_url: string;
  instagram_url: string;
  youtube_url: string;
  watch_live_enabled: boolean;
};

export const getSocialLinkSettings = cache(async function getSocialLinkSettings(
  siteScopeKey: SiteScopeKey = getCurrentSiteScopeKey()
): Promise<SocialLinkSettings> {
  const fallbackDistrictKey = getFallbackDistrictKey(siteScopeKey);
  const district = getDistrictConfig(fallbackDistrictKey);
  const fallback: SocialLinkSettings = {
    facebook_url: district.socialNav.facebookUrl,
    instagram_url: district.socialNav.instagramUrl,
    youtube_url: district.socialNav.youtubeUrl,
    watch_live_enabled: district.socialNav.watchLiveEnabled,
  };

  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("social_links")
    .select("facebook_url, instagram_url, youtube_url, watch_live_enabled")
    .eq("district_key", siteScopeKey)
    .maybeSingle();

  if (error) {
    console.error("[socialLinks:getSocialLinkSettings] Supabase query failed", {
      siteScopeKey,
      error,
    });
    return fallback;
  }

  if (!data && siteScopeKey === "global") {
    const { data: dlpcData, error: dlpcError } = await supabase
      .from("social_links")
      .select("facebook_url, instagram_url, youtube_url, watch_live_enabled")
      .eq("district_key", "dlpc")
      .maybeSingle();

    if (dlpcError) {
      console.error("[socialLinks:getSocialLinkSettings] DLPC fallback query failed", {
        siteScopeKey,
        error: dlpcError,
      });
      return fallback;
    }

    return {
      facebook_url: dlpcData?.facebook_url || fallback.facebook_url,
      instagram_url: dlpcData?.instagram_url || fallback.instagram_url,
      youtube_url: dlpcData?.youtube_url || fallback.youtube_url,
      watch_live_enabled:
        typeof dlpcData?.watch_live_enabled === "boolean"
          ? dlpcData.watch_live_enabled
          : fallback.watch_live_enabled,
    };
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
