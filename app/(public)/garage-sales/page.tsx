import Link from "next/link";
import Markdown from "@/components/public/Markdown";
import { getCurrentDistrictKey } from "@/lib/districtServer";
import {
  getOpenGarageSaleSessions,
  getPublishedGarageSaleSubmissions,
} from "@/lib/garage-sales";

export const dynamic = "force-dynamic";

function getSessionDateOptions(openDate: string, closeDate: string) {
  const dates = [];
  const current = new Date(`${openDate}T00:00:00Z`);
  const end = new Date(`${closeDate}T00:00:00Z`);

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

function formatSessionDate(dateText: string) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatSaleTime(timeText: string) {
  const [hourText, minuteText] = timeText.split(":");
  const date = new Date(Date.UTC(2026, 0, 1, Number(hourText || "0"), Number(minuteText || "0")));

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function GarageSalesPage({
  searchParams,
}: {
  searchParams?: { date?: string };
}) {
  const districtKey = await getCurrentDistrictKey();
  const selectedDate = String(searchParams?.date || "").trim();
  const sessions = await getOpenGarageSaleSessions(districtKey);
  const submissions = await getPublishedGarageSaleSubmissions(
    sessions.map((session) => session.id),
    selectedDate || undefined
  );
  const submissionsBySession = new Map<string, typeof submissions>();
  const filterDates = Array.from(
    new Set(sessions.flatMap((session) => getSessionDateOptions(session.sale_start_date, session.sale_end_date)))
  ).sort();

  for (const submission of submissions) {
    const current = submissionsBySession.get(submission.session_id) || [];
    current.push(submission);
    submissionsBySession.set(submission.session_id, current);
  }

  return (
    <main className="mx-auto max-w-site px-4 py-6">
      <div className="grid gap-6">
        <header className="rounded-lg bg-white p-6">
          <h1 className="text-2xl font-semibold">Garage Sales</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Browse current community garage sale listings and submit your own sale while submissions are open.
          </p>
          {filterDates.length > 0 && (
            <form className="mt-4 flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-sm font-medium text-neutral-700">
                <span>Filter by date</span>
                <select
                  name="date"
                  defaultValue={selectedDate}
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                >
                  <option value="">All dates</option>
                  {filterDates.map((dateText) => (
                    <option key={dateText} value={dateText}>
                      {formatSessionDate(dateText)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Apply
              </button>
              {selectedDate && (
                <Link href="/garage-sales" className="pb-2 text-sm underline">
                  Clear
                </Link>
              )}
            </form>
          )}
        </header>

        {sessions.length === 0 ? (
          <section className="rounded-lg bg-white p-6">
            <p className="text-sm text-neutral-700">
              There are no garage sale sessions open for submissions right now.
            </p>
          </section>
        ) : (
          sessions.map((session) => {
            const sessionSubmissions = submissionsBySession.get(session.id) || [];

            return (
              <section key={session.id} className="rounded-lg bg-white p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">{session.name}</h2>
                    {session.page_copy && (
                      <div className="mt-3 text-sm text-neutral-700">
                        <Markdown content={session.page_copy} />
                      </div>
                    )}
                  </div>
                  <Link
                    href={`/garage-sales/submit?session=${encodeURIComponent(session.slug)}`}
                    className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Submit Your Sale
                  </Link>
                </div>

                <div className="mt-6">
                  <h3 className="text-lg font-semibold">Published Sales</h3>
                  {sessionSubmissions.length > 0 ? (
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      {sessionSubmissions.map((sale) => (
                        <article key={sale.id} className="rounded border border-neutral-200 p-4">
                          <h4 className="text-base font-semibold">{sale.address}</h4>
                          {(sale.garage_sale_submission_dates || []).length > 0 ? (
                            <ul className="mt-2 grid gap-1 text-sm text-neutral-700">
                              {(sale.garage_sale_submission_dates || []).map((entry) => (
                                <li key={entry.sale_date}>
                                  {formatSessionDate(entry.sale_date)}: {formatSaleTime(entry.start_time)} -{" "}
                                  {formatSaleTime(entry.end_time)}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">
                              {sale.date_times}
                            </p>
                          )}
                          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                            Items in Sale
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">
                            {sale.items}
                          </p>
                          {sale.image_url && (
                            <a
                              href={sale.image_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-3 inline-block"
                            >
                              <img
                                src={sale.image_url}
                                alt=""
                                className="max-h-[250px] max-w-[300px] rounded border border-neutral-200 object-contain"
                              />
                            </a>
                          )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-neutral-600">
                      No published sales are listed for this session yet.
                    </p>
                  )}
                </div>
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}
