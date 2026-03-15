import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";

type SeasonalPage = {
  slug: "vote" | "festival-of-trails";
  nav_label: string;
  nav_enabled: boolean;
};

const PAGE_META: Record<SeasonalPage["slug"], { href: string; title: string }> = {
  vote: {
    href: "/cms/seasonal-pages/vote",
    title: "VOTE",
  },
  "festival-of-trails": {
    href: "/cms/seasonal-pages/festival-of-trails",
    title: "Festival of Trails",
  },
};

export default async function SeasonalPagesDashboard() {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("seasonal_pages")
    .select("slug, nav_label, nav_enabled")
    .order("slug", { ascending: true });

  const pages = (data || []) as SeasonalPage[];

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Seasonal Pages</h1>
        <p className="text-sm text-neutral-500">
          Seasonal page status and links to dedicated editors.
        </p>
      </header>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-2 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Page</div>
          <div>Main Nav</div>
          <div>Actions</div>
        </div>
        {pages.map((page) => {
          const meta = PAGE_META[page.slug];
          return (
            <div
              key={page.slug}
              className="grid grid-cols-[2fr_1fr_1fr] gap-2 border-b border-neutral-100 px-4 py-3 text-sm"
            >
              <div>{meta.title}</div>
              <div>{page.nav_enabled ? "On" : "Off"}</div>
              <div>
                <Link href={meta.href} className="underline">
                  Edit
                </Link>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
