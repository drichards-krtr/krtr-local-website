"use client";

import { useEffect, useState, type ReactNode } from "react";
import HeaderView, { type HeaderData } from "@/components/public/HeaderView";
import AdSlot from "@/components/public/AdSlot";
import { getDistrictConfig, getFallbackDistrictKey, type SiteScopeKey } from "@/lib/districts";
import { getTopLevelTags } from "@/lib/tags";
import type { ArticleChromeData } from "@/lib/articleChrome";
import type { Ad } from "@/lib/ads";

export default function ArticleChrome({ scope, children, placement = "story" }: { scope: string; children: ReactNode; placement?: "story" | "homepage" | "none" }) {
  const district = getDistrictConfig(getFallbackDistrictKey(scope as SiteScopeKey));
  const [chrome, setChrome] = useState<ArticleChromeData | null>(null);
  const [ads, setAds] = useState<{ allsite: Ad | null; story: Ad | null; homepage?: Ad[] }>({ allsite: null, story: null });
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch(`/api/public/article-chrome/${scope}`, { signal: controller.signal });
        if (response.ok) setChrome(await response.json());
      } catch { /* Keep the last successful display during a transient outage. */ }
    };
    void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 60_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [scope]);
  useEffect(() => {
    // Delay allows Strict Mode's discarded effect to cancel before an impression
    // request starts. Ads are requested only once per article mount, never on polling.
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/public/article-ads/${scope}?placement=${placement}`, { method: "POST", cache: "no-store" });
        if (response.ok && active) setAds(await response.json());
      } catch { /* Article content remains usable if ads are unavailable. */ }
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [scope, placement]);
  const fallback: HeaderData = {
    siteName: district.metadata.siteName, activeLogo: null,
    socialLinks: { facebook_url: district.socialNav.facebookUrl, instagram_url: district.socialNav.instagramUrl,
      youtube_url: district.socialNav.youtubeUrl, watch_live_enabled: district.socialNav.watchLiveEnabled },
    navItems: [{ label: "Home", href: "/" }, ...getTopLevelTags(district.key).map(tag => ({ label: tag.label, href: `/tags/${tag.slug}` })),
      { label: "Community Calendar", href: "/calendar" }, { label: "Share", href: "/submit-story" }],
  };
  const weather = chrome?.weather;
  const footer = chrome?.footer || { legal_name: district.footer.legalName, address_line: district.footer.addressLine, phone: district.footer.phone };
  return <>
    <HeaderView {...chrome?.header || fallback} />
    {weather?.alerts.length ? <div className="bg-krtrRed px-4 py-2 text-center text-sm text-white"><a href="/weather" className="font-semibold underline">Weather Alert{weather.alerts.length > 1 ? "s" : ""}: {weather.alerts.join(" | ")}</a></div>
      : chrome?.alert ? <div className="bg-krtrRed px-4 py-2 text-center text-sm text-white">{chrome.alert.link_url ? <a className="font-semibold underline" href={chrome.alert.link_url}>{chrome.alert.message}</a> : chrome.alert.message}</div> : null}
    <div className="bg-krtrNavy px-4 py-2 text-center text-sm text-white">{weather ? `Current Conditions: ${weather.temperatureText} - ${weather.condition} · ` : ""}<a href="/weather" className="font-semibold underline">get full forecast</a></div>
    {ads.allsite && <div className="mx-auto max-w-site px-4 py-6"><AdSlot ad={ads.allsite} className="mx-auto block max-w-[900px]" /></div>}
    {children}
    {ads.homepage?.length ? <section className="mx-auto mb-8 grid max-w-site gap-4 px-4 md:grid-cols-3">{ads.homepage.map(ad => <AdSlot key={ad.id} ad={ad} />)}</section> : null}
    {ads.story && <div className="mx-auto max-w-site px-4"><AdSlot ad={ads.story} className="mx-auto block max-w-[900px]" /></div>}
    <footer className="mt-10 border-t border-black/10 bg-white"><div className="mx-auto max-w-site px-4 py-6 text-sm">
      <p className="mb-3"><a href="/submit-story" className="underline">Share pictures, videos, tips, events, birthdays, and anniversaries</a> | <a href="/about">About Us</a> | <a href="/termsprivacy">Terms of Use</a> | <a href="/advertise">Advertise With KRTR Local</a></p>
      <p>{footer.legal_name} - {footer.address_line} - {footer.phone}</p>
    </div></footer>
  </>;
}
