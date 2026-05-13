import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  SITE_SCOPE_OPTIONS,
  getDistrictConfig,
  getFallbackDistrictKey,
  parseSiteScopeKey,
  type SiteScopeKey,
} from "@/lib/districts";

type SocialLinksRow = {
  facebook_url: string;
  instagram_url: string;
  youtube_url: string;
  watch_live_enabled: boolean;
};

function revalidateSocialLinkPaths(siteScopeKey: SiteScopeKey) {
  revalidatePath("/", "layout");
  revalidatePath("/watch-live");
  revalidatePath("/cms/social-links");
  revalidatePath(`/cms/social-links?district=${siteScopeKey}`);
}

export default async function SocialLinksPage({
  searchParams,
}: {
  searchParams?: { district?: string };
}) {
  const siteScopeKey = parseSiteScopeKey(searchParams?.district) || "dlpc";
  const fallbackDistrictKey = getFallbackDistrictKey(siteScopeKey);
  const district = getDistrictConfig(fallbackDistrictKey);
  const scopeLabel =
    SITE_SCOPE_OPTIONS.find((option) => option.value === siteScopeKey)?.label || district.name;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("social_links")
    .select("facebook_url, instagram_url, youtube_url, watch_live_enabled")
    .eq("district_key", siteScopeKey)
    .maybeSingle();
  let effectiveData = data;

  if (!effectiveData && siteScopeKey === "global") {
    const { data: fallbackData } = await supabase
      .from("social_links")
      .select("facebook_url, instagram_url, youtube_url, watch_live_enabled")
      .eq("district_key", "dlpc")
      .maybeSingle();

    effectiveData = fallbackData;
  }

  const settings: SocialLinksRow = {
    facebook_url: effectiveData?.facebook_url || district.socialNav.facebookUrl,
    instagram_url: effectiveData?.instagram_url || district.socialNav.instagramUrl,
    youtube_url: effectiveData?.youtube_url || district.socialNav.youtubeUrl,
    watch_live_enabled:
      typeof effectiveData?.watch_live_enabled === "boolean"
        ? effectiveData.watch_live_enabled
        : district.socialNav.watchLiveEnabled,
  };

  async function saveSocialLinks(formData: FormData) {
    "use server";
    const service = createServiceClient();
    const nextSiteScopeKey =
      parseSiteScopeKey(String(formData.get("district_key") || "")) || siteScopeKey;
    const nextDistrict = getDistrictConfig(getFallbackDistrictKey(nextSiteScopeKey));

    await service.from("social_links").upsert(
      {
        district_key: nextSiteScopeKey,
        facebook_url:
          String(formData.get("facebook_url") || "").trim() || nextDistrict.socialNav.facebookUrl,
        instagram_url:
          String(formData.get("instagram_url") || "").trim() || nextDistrict.socialNav.instagramUrl,
        youtube_url:
          String(formData.get("youtube_url") || "").trim() || nextDistrict.socialNav.youtubeUrl,
        watch_live_enabled: formData.get("watch_live_enabled") === "on",
      },
      { onConflict: "district_key" }
    );

    revalidateSocialLinkPaths(nextSiteScopeKey);
    redirect(`/cms/social-links?district=${nextSiteScopeKey}`);
  }

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Social Links</h1>
        <p className="text-sm text-neutral-500">
          Edit the top social nav URLs and control whether Watch Live appears.
        </p>
        <p className="mt-1 text-sm text-neutral-600">
          Editing {scopeLabel}. Global starts with DLPC defaults but can be overridden here.
        </p>
      </header>

      <form className="rounded border border-neutral-200 bg-white p-4">
        <label className="mb-2 block text-xs font-semibold uppercase text-neutral-500">District</label>
        <select
          name="district"
          defaultValue={siteScopeKey}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          {SITE_SCOPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="ml-3 rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
        >
          Switch
        </button>
      </form>

      <form action={saveSocialLinks} className="grid gap-6 rounded border border-neutral-200 bg-white p-6">
        <input type="hidden" name="district_key" value={siteScopeKey} />

        <div className="grid gap-3">
          <label className="text-sm font-medium">Facebook URL</label>
          <input
            name="facebook_url"
            defaultValue={settings.facebook_url}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-3">
          <label className="text-sm font-medium">Instagram URL</label>
          <input
            name="instagram_url"
            defaultValue={settings.instagram_url}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-3">
          <label className="text-sm font-medium">YouTube URL</label>
          <input
            name="youtube_url"
            defaultValue={settings.youtube_url}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="watch_live_enabled"
            defaultChecked={settings.watch_live_enabled}
          />
          Show WATCH LIVE BROADCAST in the top social nav
        </label>

        <button
          type="submit"
          className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Save Social Links
        </button>
      </form>
    </div>
  );
}
