"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type EditionCalendarItem = {
  id: string;
  programId: string;
  programName: string;
  title: string;
  airAt: string;
  recordingAt: string | null;
  status: string;
  localDate: string;
  localTime: string;
};

type Props = {
  editions: EditionCalendarItem[];
  weekStart: string;
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function parseDate(dateText: string) {
  const [year, month, day] = dateText.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function labelDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

export default function NrcsEditionCalendar({ editions, weekStart }: Props) {
  const [selected, setSelected] = useState<EditionCalendarItem | null>(null);
  const days = useMemo(() => {
    const start = parseDate(weekStart);
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(start, index);
      const dateText = date.toISOString().slice(0, 10);
      return {
        date,
        dateText,
        editions: editions.filter((edition) => edition.localDate === dateText),
      };
    });
  }, [editions, weekStart]);

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-7">
        {days.map((day) => (
          <section key={day.dateText} className="min-h-[180px] rounded border border-neutral-200 bg-white p-3">
            <h3 className="text-sm font-semibold">{labelDate(day.date)}</h3>
            <div className="mt-3 grid gap-2">
              {day.editions.map((edition) => (
                <button
                  key={edition.id}
                  type="button"
                  onClick={() => setSelected(edition)}
                  className="grid gap-1 rounded border border-neutral-200 p-2 text-left text-sm hover:border-neutral-400"
                >
                  <span className="font-medium">{edition.localTime} {edition.title}</span>
                  <span className="text-xs text-neutral-500">{edition.programName}</span>
                </button>
              ))}
              {day.editions.length === 0 && <p className="text-sm text-neutral-400">No editions.</p>}
            </div>
          </section>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 p-4">
          <div className="mx-auto grid max-w-lg gap-4 rounded bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{selected.title}</h3>
                <p className="text-sm text-neutral-500">{selected.programName}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded border border-neutral-300 px-3 py-1 text-sm font-semibold"
              >
                Close
              </button>
            </div>
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="text-neutral-500">Air Time</dt>
                <dd className="font-medium">{selected.localDate} {selected.localTime}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Status</dt>
                <dd className="font-medium capitalize">{selected.status}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Recording</dt>
                <dd className="font-medium">{selected.recordingAt || "-"}</dd>
              </div>
            </dl>
            <Link href={`/editions/${selected.id}`} className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
              Edit Edition
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
