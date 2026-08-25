import Link from "next/link";
import type { ReactNode } from "react";
import type { NrcsDistrictContext } from "@/lib/districts";
import type { NrcsStaffProfile } from "@/lib/roles";
import NrcsLogoutButton from "./NrcsLogoutButton";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Users", href: "/users", minimumRole: "admin" },
] as const;

export default function NrcsShell({
  children,
  districtContext,
  profile,
}: {
  children: ReactNode;
  districtContext: NrcsDistrictContext;
  profile: NrcsStaffProfile;
}) {
  const visibleItems = NAV_ITEMS.filter(
    (item) => !("minimumRole" in item) || profile.role === item.minimumRole
  );

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-950">
      <div className="flex min-h-screen">
        <aside className="w-64 border-r border-neutral-200 bg-white">
          <div className="px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              KRTR Local
            </p>
            <div className="mt-1 text-lg font-semibold">NRCS</div>
          </div>
          <nav className="grid gap-1 px-3 pb-6 text-sm">
            {visibleItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded px-3 py-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-8 py-4">
            <div>
              <div className="text-sm font-medium">Newsroom Console</div>
              <div className="text-xs text-neutral-500">
                <span className="capitalize">{profile.role}</span>
                {districtContext.activeDistrict ? ` · ${districtContext.activeDistrict.display_name}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-neutral-500">{profile.email}</div>
              <NrcsLogoutButton />
            </div>
          </header>
          <main className="flex-1 px-8 py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
