import Link from "next/link";
import { getTopLevelTags } from "@/lib/tags";

const NAV_ITEMS = [
  { label: "Home", href: "/" },
  ...getTopLevelTags().map((tag) => ({
    label: tag.label,
    href: `/tags/${tag.slug}`,
  })),
  { label: "Share", href: "https://forms.gle/ANKMcHbbSXwieYKRA" },
];

export default function Header() {
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
            className="text-sm font-bold text-red-600 [text-shadow:-1px_0_0_#fff,1px_0_0_#fff,0_-1px_0_#fff,0_1px_0_#fff]"
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
          <Link href="/" className="text-2xl font-semibold tracking-wide">
            KRTR Local
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
