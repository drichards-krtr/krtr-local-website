import HeaderView from "@/components/public/HeaderView";
import { getDistrictConfig, type DistrictKey, type SiteScopeKey } from "@/lib/districts";
import { getTopLevelTags } from "@/lib/tags";
import { createPublicClient } from "@/lib/supabase/public";
import HeaderNav from "@/components/public/HeaderNav";
import { getPreferredLogo } from "@/lib/logos";
import { getCurrentDistrict, getCurrentSiteScopeKey } from "@/lib/districtServer";
import { getSocialLinkSettings } from "@/lib/socialLinks";
import { getOpenGarageSaleSessions } from "@/lib/garage-sales";

type ActiveLogo = {
  image_url: string;
  description: string | null;
};

type SeasonalNavItem = {
  slug: "vote" | "festival-of-trails";
  nav_label: string;
  nav_enabled: boolean;
};

async function getSeasonalNavItems(
  districtKey: string
): Promise<Array<{ label: string; href: string }>> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("seasonal_pages")
    .select("slug, nav_label, nav_enabled")
    .eq("district_key", districtKey)
    .in("slug", ["vote", "festival-of-trails"]);

  if (error) {
    console.error("[Header:getSeasonalNavItems] Supabase query failed", error);
    return [];
  }

  return ((data || []) as SeasonalNavItem[])
    .filter((row) => row.nav_enabled)
    .sort((a, b) => (a.slug === "vote" ? -1 : b.slug === "vote" ? 1 : 0))
    .map((row) => ({
      label: row.nav_label,
      href: row.slug === "vote" ? "/vote" : "/festival-of-trails",
    }));
}

export async function getHeaderData(districtKey?: DistrictKey, scopeKey?: SiteScopeKey) {
  const district = districtKey ? getDistrictConfig(districtKey) : await getCurrentDistrict();
  const siteScopeKey = scopeKey || await getCurrentSiteScopeKey();
  const baseNavItems = [
    { label: "Home", href: "/" },
    ...getTopLevelTags(district.key).map((tag) => ({
      label: tag.label,
      href: `/tags/${tag.slug}`,
    })),
    { label: "Community Calendar", href: "/calendar" },
    { label: "Share", href: "/submit-story" },
  ];
  const [socialLinks, activeLogo, seasonalNavItems, garageSaleSessions] = await Promise.all([
    getSocialLinkSettings(siteScopeKey),
    getPreferredLogo(district.key),
    getSeasonalNavItems(district.key),
    getOpenGarageSaleSessions(district.key),
  ]);
  const garageSaleNavItems =
    garageSaleSessions.length > 0 ? [{ label: "Garage Sales", href: "/garage-sales" }] : [];
  const navItems = [...baseNavItems, ...garageSaleNavItems, ...seasonalNavItems].filter((item) =>
    item.href === "/festival-of-trails" ? district.features.festivalOfTrails : true
  );

  return { siteName: district.metadata.siteName, socialLinks, activeLogo, navItems };
}

export default async function Header() {
  return <HeaderView {...await getHeaderData()} />;
}
