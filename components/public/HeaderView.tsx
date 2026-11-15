import Link from "next/link";
import HeaderNav from "@/components/public/HeaderNav";
import type { SocialLinkSettings } from "@/lib/socialLinks";

export type HeaderData = {
  siteName: string;
  socialLinks: SocialLinkSettings;
  activeLogo: { image_url: string; description: string | null } | null;
  navItems: Array<{ label: string; href: string }>;
};
export default function HeaderView({ siteName, socialLinks, activeLogo, navItems }: HeaderData) {
  return (
    <header>
      <div className="bg-black text-white">
        <div className="mx-auto flex max-w-site items-center justify-center gap-3 py-1 text-xs">
          {socialLinks.facebook_url && (
            <a href={socialLinks.facebook_url} aria-label="Facebook">
              FB
            </a>
          )}
          {socialLinks.instagram_url && (
            <a href={socialLinks.instagram_url} aria-label="Instagram">
              IG
            </a>
          )}
          {socialLinks.youtube_url && (
            <a href={socialLinks.youtube_url} aria-label="YouTube">
              YT
            </a>
          )}
          {socialLinks.watch_live_enabled && (
            <a
              href="/watch-live"
              aria-label="Watch live"
              className="text-sm font-bold text-red-600 [text-shadow:-0.5px_0_0_#fff,0.5px_0_0_#fff,0_-0.5px_0_#fff,0_0.5px_0_#fff]"
            >
              WATCH LIVE BROADCAST
            </a>
          )}
        </div>
      </div>
      <div className="bg-krtrNavy text-white">
        <div className="mx-auto flex max-w-site flex-wrap items-center justify-center gap-6 px-4 py-4 md:justify-between">
          <Link href="/" className="inline-flex items-center">
            {activeLogo ? (
              <img
                src={activeLogo.image_url}
                alt={activeLogo.description || "KRTR Local"}
                className="h-14 w-auto max-w-[280px] object-contain"
              />
            ) : (
              <span className="text-2xl font-semibold tracking-wide">KRTR Local</span>
            )}
          </Link>
          <Link
            href="/advertise"
            className="rounded bg-white px-4 py-2 text-sm font-semibold text-krtrNavy"
          >
            Advertise With KRTR Local
          </Link>
        </div>
        <HeaderNav navItems={navItems} />
      </div>
    </header>
  );
}
