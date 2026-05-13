import Link from "next/link";
import Markdown from "@/components/public/Markdown";
import { getCurrentDistrictKey } from "@/lib/districtServer";
import {
  getOpenGarageSaleSessions,
  getPublishedGarageSaleSubmissions,
} from "@/lib/garage-sales";

export const dynamic = "force-dynamic";

export default async function GarageSalesPage() {
  const districtKey = getCurrentDistrictKey();
  const sessions = await getOpenGarageSaleSessions(districtKey);
  const submissions = await getPublishedGarageSaleSubmissions(sessions.map((session) => session.id));
  const submissionsBySession = new Map<string, typeof submissions>();

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
                          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">
                            {sale.date_times}
                          </p>
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
