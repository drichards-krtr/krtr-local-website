import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getCurrentDistrict } from "@/lib/districtServer";
import {
  getNomineeName,
  getVotingGroupLabel,
  getVotingGroupsForCategory,
  votingSessionIsOpenInCentralTime,
  type VotingSession,
} from "@/lib/nominationVoting";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type NominationSubmission = {
  id: string;
  category: VotingSession["category"];
  payload: Record<string, unknown>;
};

type Finalist = {
  id: string;
  session_id: string;
  nomination_submission_id: string;
  voting_group: string;
  nomination_submissions?: NominationSubmission | NominationSubmission[];
};

function getVoteCookieName(sessionId: string, group: string) {
  return `nomvote_${sessionId.replaceAll("-", "")}_${group.replace(/[^a-z0-9]/gi, "_")}`;
}

function getFinalistSubmission(finalist: Finalist) {
  return Array.isArray(finalist.nomination_submissions)
    ? finalist.nomination_submissions[0]
    : finalist.nomination_submissions;
}

export default async function NominationVotingPublicPage({
  params,
  searchParams,
}: {
  params: { sessionSlug: string };
  searchParams?: { success?: string };
}) {
  const district = getCurrentDistrict();
  const supabase = createServiceClient();
  const { data: sessionData, error: sessionError } = await supabase
    .from("nomination_voting_sessions")
    .select("id, district_key, nomination_id, category, slug, title, open_date, close_date, status_override, created_at")
    .eq("district_key", district.key)
    .eq("slug", params.sessionSlug)
    .maybeSingle();

  if (sessionError) throw new Error(`[NominationVotingPublicPage] ${sessionError.message}`);
  if (!sessionData) notFound();

  const session = sessionData as VotingSession;
  if (!votingSessionIsOpenInCentralTime(session)) notFound();

  if (session.status_override !== "force_open") {
    const { data: forcedSession } = await supabase
      .from("nomination_voting_sessions")
      .select("id")
      .eq("district_key", district.key)
      .eq("status_override", "force_open")
      .neq("id", session.id)
      .maybeSingle();
    if (forcedSession) notFound();
  }

  const { data: finalistsData, error: finalistsError } = await supabase
    .from("nomination_voting_finalists")
    .select("id, session_id, nomination_submission_id, voting_group, nomination_submissions(id, category, payload)")
    .eq("session_id", session.id)
    .order("voting_group", { ascending: true })
    .order("sort_order", { ascending: true });

  if (finalistsError) throw new Error(`[NominationVotingPublicPage:finalists] ${finalistsError.message}`);

  const finalists = (finalistsData || []) as Finalist[];
  if (!finalists.length) notFound();

  const finalistsByGroup = new Map<string, Finalist[]>();
  for (const group of getVotingGroupsForCategory(session.category)) {
    const groupFinalists = finalists.filter((finalist) => finalist.voting_group === group);
    if (groupFinalists.length > 0) finalistsByGroup.set(group, groupFinalists);
  }

  const cookieStore = cookies();
  const lockedGroups = new Set(
    Array.from(finalistsByGroup.keys()).filter((group) => cookieStore.get(getVoteCookieName(session.id, group))?.value)
  );

  async function submitVotes(formData: FormData) {
    "use server";
    const service = createServiceClient();
    const latest = await service
      .from("nomination_voting_sessions")
      .select("id, district_key, nomination_id, category, slug, title, open_date, close_date, status_override, created_at")
      .eq("id", session.id)
      .eq("district_key", district.key)
      .maybeSingle();

    if (latest.error || !latest.data || !votingSessionIsOpenInCentralTime(latest.data as VotingSession)) {
      redirect("/");
    }

    const { data: validFinalists, error: validError } = await service
      .from("nomination_voting_finalists")
      .select("id, voting_group")
      .eq("session_id", session.id);

    if (validError) redirect(`/nominations/vote/${session.slug}`);

    const finalistById = new Map((validFinalists || []).map((row) => [String(row.id), String(row.voting_group)]));
    const rows: Array<{ session_id: string; finalist_id: string; voting_group: string }> = [];
    const groups = getVotingGroupsForCategory(session.category);

    for (const group of groups) {
      const cookieName = getVoteCookieName(session.id, group);
      if (cookies().get(cookieName)?.value) continue;

      const finalistId = String(formData.get(`vote_${group}`) || "");
      if (!finalistId || finalistById.get(finalistId) !== group) continue;

      rows.push({
        session_id: session.id,
        finalist_id: finalistId,
        voting_group: group,
      });
    }

    if (rows.length) {
      const { error } = await service.from("nomination_votes").insert(rows);
      if (!error) {
        for (const row of rows) {
          cookies().set({
            name: getVoteCookieName(session.id, row.voting_group),
            value: "1",
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 60 * 60 * 24 * 365 * 10,
          });
        }
        revalidatePath(`/nominations/vote/${session.slug}`);
        redirect(`/nominations/vote/${session.slug}?success=1`);
      }
    }

    redirect(`/nominations/vote/${session.slug}`);
  }

  const allGroupsLocked = Array.from(finalistsByGroup.keys()).every((group) => lockedGroups.has(group));

  return (
    <main className="mx-auto max-w-site px-4 py-6">
      <section className="rounded-lg bg-white p-6">
        <header className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Public Voting</p>
          <h1 className="mt-2 text-2xl font-semibold">{session.title}</h1>
        </header>

        {searchParams?.success && (
          <p className="mb-5 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Your vote has been recorded.
          </p>
        )}

        {allGroupsLocked ? (
          <p className="rounded border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
            This browser has already voted in this session.
          </p>
        ) : (
          <form action={submitVotes} className="grid gap-5">
            {Array.from(finalistsByGroup.entries()).map(([group, groupFinalists]) => {
              const locked = lockedGroups.has(group);
              return (
                <fieldset key={group} className="rounded border border-neutral-200 p-4">
                  <legend className="px-1 text-sm font-semibold">{getVotingGroupLabel(session.category, group)}</legend>
                  {locked ? (
                    <p className="mt-2 text-sm text-neutral-600">Vote already recorded for this group.</p>
                  ) : (
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {groupFinalists.map((finalist) => {
                        const submission = getFinalistSubmission(finalist);
                        return (
                          <label key={finalist.id} className="flex gap-3 rounded border border-neutral-200 p-4 text-sm">
                            <input type="radio" name={`vote_${group}`} value={finalist.id} />
                            <span className="font-medium">
                              {submission ? getNomineeName(submission.category, submission.payload || {}) : "Finalist"}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </fieldset>
              );
            })}
            <button type="submit" className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
              Submit Vote
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
