import { createPublicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

type VoteJurisdiction = {
  slug: string;
  label: string;
  seats_open: number;
  sort_order: number;
};

type VoteSeat = {
  id: string;
  jurisdiction_slug: string;
  seat_key: string;
  seat_name: string;
  term_years: number | null;
  sort_order: number;
};

type VoteCandidate = {
  id: string;
  jurisdiction_slug: string;
  seat_id: string | null;
  candidate_name: string;
  photo_url: string | null;
  link_1_url: string | null;
  link_1_text: string | null;
  link_2_url: string | null;
  link_2_text: string | null;
  sort_order: number;
};

export default async function VotePage() {
  const supabase = createPublicClient();
  const [{ data: jurisdictionsData }, { data: seatsData }, { data: candidatesData }] =
    await Promise.all([
      supabase
        .from("vote_jurisdictions")
        .select("slug, label, seats_open, sort_order")
        .order("sort_order", { ascending: true }),
      supabase
        .from("vote_seats")
        .select("id, jurisdiction_slug, seat_key, seat_name, term_years, sort_order")
        .order("jurisdiction_slug", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("seat_key", { ascending: true }),
      supabase
        .from("vote_candidates")
        .select(
          "id, jurisdiction_slug, seat_id, candidate_name, photo_url, link_1_url, link_1_text, link_2_url, link_2_text, sort_order"
        )
        .order("jurisdiction_slug", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("candidate_name", { ascending: true }),
    ]);

  const jurisdictions = (jurisdictionsData || []) as VoteJurisdiction[];
  const seats = (seatsData || []) as VoteSeat[];
  const candidates = (candidatesData || []) as VoteCandidate[];

  const seatsByJurisdiction = new Map<string, VoteSeat[]>();
  const candidatesByJurisdiction = new Map<string, VoteCandidate[]>();
  const seatById = new Map(seats.map((seat) => [seat.id, seat]));

  for (const seat of seats) {
    const list = seatsByJurisdiction.get(seat.jurisdiction_slug) || [];
    list.push(seat);
    seatsByJurisdiction.set(seat.jurisdiction_slug, list);
  }

  for (const candidate of candidates) {
    const list = candidatesByJurisdiction.get(candidate.jurisdiction_slug) || [];
    list.push(candidate);
    candidatesByJurisdiction.set(candidate.jurisdiction_slug, list);
  }

  return (
    <main className="mx-auto max-w-site px-4 py-6">
      <section className="grid gap-6 rounded-lg bg-white p-6">
        <header>
          <h1 className="text-2xl font-semibold">VOTE</h1>
        </header>

        {jurisdictions.map((jurisdiction) => {
          const jurisdictionSeats = seatsByJurisdiction.get(jurisdiction.slug) || [];
          const jurisdictionCandidates = candidatesByJurisdiction.get(jurisdiction.slug) || [];

          return (
            <article key={jurisdiction.slug} className="rounded border border-neutral-200 p-4">
              <h2 className="text-xl font-semibold">{jurisdiction.label}</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Seats Open: {jurisdiction.seats_open}
              </p>

              {jurisdictionSeats.length > 0 && (
                <div className="mt-4 grid gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-600">
                    Seat Details
                  </h3>
                  {jurisdictionSeats.map((seat) => (
                    <p key={seat.id} className="text-sm text-neutral-700">
                      {seat.seat_key}
                      {seat.seat_name ? `: ${seat.seat_name}` : ""}
                      {seat.term_years ? ` | Term: ${seat.term_years} year${seat.term_years === 1 ? "" : "s"}` : ""}
                    </p>
                  ))}
                </div>
              )}

              {jurisdictionCandidates.length > 0 ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {jurisdictionCandidates.map((candidate) => {
                    const seat = candidate.seat_id ? seatById.get(candidate.seat_id) : null;
                    const links = [
                      {
                        text: candidate.link_1_text?.trim(),
                        url: candidate.link_1_url?.trim(),
                      },
                      {
                        text: candidate.link_2_text?.trim(),
                        url: candidate.link_2_url?.trim(),
                      },
                    ].filter((link) => Boolean(link.text) && Boolean(link.url));

                    return (
                      <div key={candidate.id} className="rounded border border-neutral-200 p-4">
                        <h4 className="text-lg font-semibold">{candidate.candidate_name}</h4>
                        {seat && (
                          <p className="mt-1 text-sm text-neutral-600">
                            Running for {seat.seat_key}
                            {seat.seat_name ? ` (${seat.seat_name})` : ""}
                            {seat.term_years ? ` | ${seat.term_years}-year term` : ""}
                          </p>
                        )}
                        {candidate.photo_url && (
                          <img
                            src={candidate.photo_url}
                            alt={candidate.candidate_name}
                            className="mt-3 h-44 w-full rounded border border-neutral-200 object-cover"
                          />
                        )}
                        {links.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                            {links.map((link, index) => (
                              <a
                                key={`${candidate.id}-link-${index}`}
                                href={link.url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold underline"
                              >
                                {link.text}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3 text-sm text-neutral-600">No candidates listed yet.</p>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
