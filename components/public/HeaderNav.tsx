"use client";

import { useState } from "react";
import Link from "next/link";

type NavItem = {
  label: string;
  href: string;
};

type Props = {
  navItems: NavItem[];
};

export default function HeaderNav({ navItems }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="border-t border-white/10 bg-krtrNavy md:hidden">
        <div className="mx-auto flex max-w-site items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold uppercase tracking-[0.2em] text-white/80">
            Menu
          </span>
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls="mobile-site-nav"
            aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
            className="inline-flex h-10 w-10 items-center justify-center rounded border border-white/20 text-white"
            onClick={() => setIsOpen((open) => !open)}
          >
            <span className="sr-only">{isOpen ? "Close menu" : "Open menu"}</span>
            <span className="flex w-5 flex-col gap-1.5">
              <span
                className={`block h-0.5 w-full bg-current transition ${
                  isOpen ? "translate-y-2 rotate-45" : ""
                }`}
              />
              <span
                className={`block h-0.5 w-full bg-current transition ${
                  isOpen ? "opacity-0" : ""
                }`}
              />
              <span
                className={`block h-0.5 w-full bg-current transition ${
                  isOpen ? "-translate-y-2 -rotate-45" : ""
                }`}
              />
            </span>
          </button>
        </div>
        {isOpen && (
          <nav id="mobile-site-nav" className="border-t border-white/10 px-4 pb-4">
            <ul className="grid gap-2 text-sm font-semibold">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block rounded border border-white/10 px-3 py-2 text-white transition hover:text-krtrRed"
                    onClick={() => setIsOpen(false)}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      <nav className="hidden border-t border-white/10 bg-krtrNavy md:block">
        <ul className="mx-auto flex max-w-site flex-wrap justify-center gap-4 px-4 py-3 text-sm font-semibold">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="text-white transition hover:text-krtrRed">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
