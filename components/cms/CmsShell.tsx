import Link from "next/link";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/cms" },
  { label: "Stories", href: "/cms/stories" },
  { label: "Ads", href: "/cms/ads" },
  { label: "Calendar", href: "/cms/calendar" },
  { label: "Stream Config", href: "/cms/stream-config" },
  { label: "Alerts", href: "/cms/alerts" },
  { label: "Users", href: "/cms/users" },
  { label: "Settings", href: "/cms/settings" },
];

export default function CmsShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      <div className="flex min-h-screen">
        <aside className="w-64 border-r border-neutral-200 bg-white">
          <div className="px-6 py-5 text-lg font-semibold">KRTR Local CMS</div>
          <nav className="grid gap-1 px-3 pb-6 text-sm">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded px-3 py-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-8 py-4">
            <div className="text-sm text-neutral-500">
              Admin Console
            </div>
            <div className="text-sm text-neutral-500">KRTR Local</div>
          </header>
          <main className="flex-1 px-8 py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
