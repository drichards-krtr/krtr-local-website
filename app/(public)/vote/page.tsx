import Markdown from "@/components/public/Markdown";
import { createPublicClient } from "@/lib/supabase/public";
import { getCurrentDistrict } from "@/lib/districtServer";

export const dynamic = "force-dynamic";

type VoteCandidate = {
  id: string;
  jurisdiction_name: string;
  seat_label: string | null;
  candidate_name: string;
  photo_url: string | null;
  link_1_url: string | null;
  link_1_text: string | null;
  link_2_url: string | null;
  link_2_text: string | null;
  sort_order: number;
};

export default async function VotePage() {
  const district = getCurrentDistrict();
  if (!district.features.vote) {
    return null;
  }
  const supabase = createPublicClient();
  const [{ data: copyData }, { data: candidatesData }] =
    await Promise.all([
      supabase
        .from("vote_page_content")
        .select("body_markdown")
        .eq("district_key", district.key)
        .eq("id", 1)
        .maybeSingle(),
      supabase
        .from("vote_candidates")
        .select(
          "id, jurisdiction_name, seat_label, candidate_name, photo_url, link_1_url, link_1_text, link_2_url, link_2_text"
        )
        .eq("district_key", district.key)
        .order("jurisdiction_name", { ascending: true })
        .order("candidate_name", { ascending: true }),
    ]);

  const bodyMarkdown = String(copyData?.body_markdown || "");
  const candidates = (candidatesData || []) as VoteCandidate[];
  const candidatesByJurisdiction = new Map<string, VoteCandidate[]>();

  for (const candidate of candidates) {
    const key = candidate.jurisdiction_name.trim() || "Other";
    const list = candidatesByJurisdiction.get(key) || [];
    list.push(candidate);
    candidatesByJurisdiction.set(key, list);
  }

  return (
    <main className="mx-auto max-w-site px-4 py-6">
      <section className="grid gap-6 rounded-lg bg-white p-6">
        <header>
          <h1 className="text-2xl font-semibold">VOTE</h1>
        </header>

        {bodyMarkdown && <Markdown content={bodyMarkdown} />}

        {Array.from(candidatesByJurisdiction.entries()).map(([jurisdictionName, jurisdictionCandidates]) => {
          return (
            <article key={jurisdictionName} className="rounded border border-neutral-200 p-4">
              <h2 className="text-xl font-semibold">{jurisdictionName}</h2>
              {jurisdictionCandidates.length > 0 ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {jurisdictionCandidates.map((candidate) => {
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
                        {candidate.seat_label && (
                          <p className="mt-1 text-sm text-neutral-600">{candidate.seat_label}</p>
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

        {candidates.length === 0 && (
          <p className="text-sm text-neutral-600">No candidates listed yet.</p>
        )}
      </section>
    </main>
  );
}
