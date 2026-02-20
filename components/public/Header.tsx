import Link from "next/link";
import { getTopLevelTags } from "@/lib/tags";
import { createPublicClient } from "@/lib/supabase/public";

const NAV_ITEMS = [
  { label: "Home", href: "/" },
  ...getTopLevelTags().map((tag) => ({
    label: tag.label,
    href: `/tags/${tag.slug}`,
  })),
  { label: "Community Calendar", href: "/calendar" },
  { label: "Share", href: "/submit-story" },
];

type ActiveLogo = {
  image_url: string;
  description: string | null;
};

async function getActiveLogo(): Promise<ActiveLogo | null> {
  const supabase = createPublicClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("logos")
    .select("image_url, description")
    .eq("active", true)
    .lte("start_date", today)
    .gte("end_date", today)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[Header:getActiveLogo] Supabase query failed", error);
    return null;
  }

  if (!data?.image_url) return null;

  return data as ActiveLogo;
}

export default async function Header() {
  const activeLogo = await getActiveLogo();

  return (
    <header>
      <div className="bg-black text-white">
        <div className="mx-auto flex max-w-site items-center justify-center gap-3 py-1 text-xs">
          <a href="https://www.facebook.com/KRTRLocal/" aria-label="Facebook">
            FB
          </a>
          <a href="https://www.instagram.com/krtr_local/" aria-label="Instagram">
            IG
          </a>
          <a
            href="https://www.youtube.com/@KRTR-Local/live"
            aria-label="Watch live"
            className="text-sm font-bold text-red-600 [text-shadow:-0.5px_0_0_#fff,0.5px_0_0_#fff,0_-0.5px_0_#fff,0_0.5px_0_#fff]"
          >
            LIVE
          </a>
          <a href="https://x.com/KRTR_Local" aria-label="X">
            X
          </a>
          <a href="https://www.youtube.com/@KRTR-Local" aria-label="YouTube">
            YT
          </a>
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
        <nav className="border-t border-white/10 bg-krtrNavy">
          <ul className="mx-auto flex max-w-site flex-wrap justify-center gap-4 px-4 py-3 text-sm font-semibold">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-white transition hover:text-krtrRed"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
