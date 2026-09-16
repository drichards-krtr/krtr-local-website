"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Props = {
  title: string;
  programName: string;
  airAt: string;
  href: string;
  timeZone: string;
};

function formatCountdown(ms: number) {
  if (ms <= 0) return "Airing now";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export default function NrcsLiveRundownAlert({ title, programName, airAt, href, timeZone }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const airTime = useMemo(() => new Date(airAt).getTime(), [airAt]);
  const airLabel = useMemo(() => {
    const date = new Date(airAt);
    if (Number.isNaN(date.getTime())) return airAt;
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }, [airAt, timeZone]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <section className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase">Live Rundown Today</div>
          <div className="mt-1 text-sm">
            <span className="font-semibold">{title}</span>
            <span className="mx-2 text-amber-700">|</span>
            <span>{programName}</span>
            <span className="mx-2 text-amber-700">|</span>
            <span>Airs at {airLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded bg-amber-200 px-3 py-1 text-sm font-semibold">
            {formatCountdown(airTime - now)}
          </span>
          <Link href={href} className="text-sm font-semibold underline">
            Open
          </Link>
        </div>
      </div>
    </section>
  );
}
