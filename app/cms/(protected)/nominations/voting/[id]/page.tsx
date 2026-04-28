import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseDistrictKey, type DistrictKey } from "@/lib/districts";
import {
  FINALISTS_PER_GROUP_MAX,
  getNomineeName,
  getSubmissionVotingGroup,
  getVotingGroupLabel,
  getVotingGroupsForCategory,
  type VotingSession,
} from "@/lib/nominationVoting";
import { NOMINATION_CATEGORY_LABELS, type NominationCategory } from "@/lib/nominations";
import { createServerSupabase } from "@/lib/supabase/server";

type NominationSubmission = {
  id: string;
  category: NominationCategory;
  payload: Record<string, unknown>;
  submitted_at: string;
};

type Finalist = {
  id: string;
  session_id: string;
  nomination_submission_id: string;
  voting_group: string;
  nomination_submissions?: NominationSubmission | NominationSubmission[];
};

type Vote = {
  finalist_id: string;
  voting_group: string;
};

type Winner = {
  finalist_id: string;
  voting_group: string;
};

function revalidateVotingPaths(districtKey: DistrictKey, slug: string) {
  revalidatePath("/");
  revalidatePath("/cms/nominations/voting");
  revalidatePath(`/cms/nominations/voting?district=${districtKey}`);
  revalidatePath(`/nominations/vote/${slug}`);
}

function countBy<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = key(item);
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

function getErrorMessage(error: string) {
  if (error.includes("overlaps")) return "Voting dates overlap an existing session.";
  if (error.includes("already open")) return "Another voting session is already open.";
  if (error.includes("four finalists")) return "Voting sessions can include no more than four finalists per group.";
  if (error.includes("Delete votes before changing finalists")) return "Delete votes before changing finalists for this session.";
  return error;
}

function getFinalistSubmission(finalist: Finalist) {
  return Array.isArray(finalist.nomination_submissions)
    ? finalist.nomination_submissions[0]
    : finalist.nomination_submissions;
}

export default async function EditNominationVotingPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { district?: string; error?: string; success?: string };
}) {
  const districtKey = parseDistrictKey(searchParams?.district) || "dlpc";
  const supabase = createServerSupabase();

  const { data: sessionData, error: sessionError } = await supabase
    .from("nomination_voting_sessions")
    .select("id, district_key, nomination_id, category, slug, title, open_date, close_date, status_override, created_at")
    .eq("id", params.id)
    .eq("district_key", districtKey)
    .maybeSingle();

  if (sessionError) throw new Error(`[EditNominationVotingPage] ${sessionError.message}`);
  if (!sessionData) return <p>Voting session not found.</p>;

  const session = sessionData as VotingSession;

  const [{ data: submissionsData }, { data: finalistsData }, { data: votesData }, { data: winnersData }] =
    await Promise.all([
      supabase
        .from("nomination_submissions")
        .select("id, category, payload, submitted_at")
        .eq("district_key", districtKey)
        .eq("nomination_id", session.nomination_id)
        .eq("category", session.category)
        .order("submitted_at", { ascending: true }),
      supabase
        .from("nomination_voting_finalists")
        .select("id, session_id, nomination_submission_id, voting_group, nomination_submissions(id, category, payload, submitted_at)")
        .eq("session_id", session.id)
        .order("voting_group", { ascending: true })
        .order("sort_order", { ascending: true }),
      supabase.from("nomination_votes").select("finalist_id, voting_group").eq("session_id", session.id),
      supabase.from("nomination_voting_winners").select("finalist_id, voting_group").eq("session_id", session.id),
    ]);

  const submissions = ((submissionsData || []) as NominationSubmission[]).filter((row) => {
    const group = getSubmissionVotingGroup(row.category, row.payload || {});
    return getNomineeName(row.category, row.payload || {}) && getVotingGroupsForCategory(row.category).includes(group);
  });
  const finalists = (finalistsData || []) as Finalist[];
  const votes = (votesData || []) as Vote[];
  const winners = (winnersData || []) as Winner[];
  const voteCounts = countBy(votes, (row) => row.finalist_id);
  const winnerByGroup = new Map(winners.map((winner) => [winner.voting_group, winner.finalist_id]));
  const selectedFinalistSubmissionIds = new Set(finalists.map((row) => row.nomination_submission_id));

  const submissionsByGroup = new Map<string, NominationSubmission[]>();
  const finalistsByGroup = new Map<string, Finalist[]>();
  for (const group of getVotingGroupsForCategory(session.category)) {
    submissionsByGroup.set(group, []);
    finalistsByGroup.set(group, []);
  }
  for (const submission of submissions) {
    const group = getSubmissionVotingGroup(submission.category, submission.payload || {});
    submissionsByGroup.set(group, [...(submissionsByGroup.get(group) || []), submission]);
  }
  for (const finalist of finalists) {
    finalistsByGroup.set(finalist.voting_group, [...(finalistsByGroup.get(finalist.voting_group) || []), finalist]);
  }

  async function saveSession(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;
    const { error } = await service
      .from("nomination_voting_sessions")
      .update({
        title: String(formData.get("title") || "").trim(),
        open_date: String(formData.get("open_date") || ""),
        close_date: String(formData.get("close_date") || ""),
        status_override: String(formData.get("status_override") || "auto"),
      })
      .eq("id", params.id)
      .eq("district_key", nextDistrictKey);

    if (error) {
      redirect(`/cms/nominations/voting/${params.id}?district=${nextDistrictKey}&error=${encodeURIComponent(error.message)}`);
    }

    revalidateVotingPaths(nextDistrictKey, session.slug);
    redirect(`/cms/nominations/voting/${params.id}?district=${nextDistrictKey}&success=session`);
  }

  async function saveFinalists(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;
    const selectedIds = formData.getAll("finalist").map(String).filter(Boolean);

    const { count: voteCount, error: voteCountError } = await service
      .from("nomination_votes")
      .select("id", { count: "exact", head: true })
      .eq("session_id", params.id);
    if (voteCountError) {
      redirect(`/cms/nominations/voting/${params.id}?district=${nextDistrictKey}&error=${encodeURIComponent(voteCountError.message)}`);
    }
    if ((voteCount || 0) > 0) {
      redirect(`/cms/nominations/voting/${params.id}?district=${nextDistrictKey}&error=${encodeURIComponent("Delete votes before changing finalists.")}`);
    }

    const { data: selectedRows, error: selectedError } = await service
      .from("nomination_submissions")
      .select("id, category, payload")
      .eq("district_key", nextDistrictKey)
      .eq("nomination_id", session.nomination_id)
      .in("id", selectedIds);

    if (selectedError) {
      redirect(`/cms/nominations/voting/${params.id}?district=${nextDistrictKey}&error=${encodeURIComponent(selectedError.message)}`);
    }

    const nextRows = ((selectedRows || []) as NominationSubmission[]).map((row, index) => ({
      session_id: params.id,
      nomination_submission_id: row.id,
      voting_group: getSubmissionVotingGroup(row.category, row.payload || {}),
      sort_order: index + 1,
    }));
    const groupCounts = countBy(nextRows, (row) => row.voting_group);
    if (Array.from(groupCounts.values()).some((count) => count > FINALISTS_PER_GROUP_MAX)) {
      redirect(`/cms/nominations/voting/${params.id}?district=${nextDistrictKey}&error=${encodeURIComponent("Voting sessions can include no more than four finalists per group.")}`);
    }

    const { error: winnerDeleteError } = await service.from("nomination_voting_winners").delete().eq("session_id", params.id);
    if (winnerDeleteError) {
      redirect(`/cms/nominations/voting/${params.id}?district=${nextDistrictKey}&error=${encodeURIComponent(winnerDeleteError.message)}`);
    }

    const { error: deleteError } = await service.from("nomination_voting_finalists").delete().eq("session_id", params.id);
    if (deleteError) {
      redirect(`/cms/nominations/voting/${params.id}?district=${nextDistrictKey}&error=${encodeURIComponent(deleteError.message)}`);
    }

    if (nextRows.length) {
      const { error: insertError } = await service.from("nomination_voting_finalists").insert(nextRows);
      if (insertError) {
        redirect(`/cms/nominations/voting/${params.id}?district=${nextDistrictKey}&error=${encodeURIComponent(insertError.message)}`);
      }
    }

    revalidateVotingPaths(nextDistrictKey, session.slug);
    redirect(`/cms/nominations/voting/${params.id}?district=${nextDistrictKey}&success=finalists`);
  }

  async function saveWinners(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;
    const groups = getVotingGroupsForCategory(session.category);
    const rows = groups
      .map((group) => ({
        session_id: params.id,
        voting_group: group,
        finalist_id: String(formData.get(`winner_${group}`) || ""),
      }))
      .filter((row) => row.finalist_id);

    const { error: deleteError } = await service.from("nomination_voting_winners").delete().eq("session_id", params.id);
    if (deleteError) {
      redirect(`/cms/nominations/voting/${params.id}?district=${nextDistrictKey}&error=${encodeURIComponent(deleteError.message)}`);
    }
    if (rows.length) {
      const { error: insertError } = await service.from("nomination_voting_winners").insert(rows);
      if (insertError) {
        redirect(`/cms/nominations/voting/${params.id}?district=${nextDistrictKey}&error=${encodeURIComponent(insertError.message)}`);
      }
    }

    revalidateVotingPaths(nextDistrictKey, session.slug);
    redirect(`/cms/nominations/voting/${params.id}?district=${nextDistrictKey}&success=winners`);
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{session.title}</h1>
          <p className="text-sm text-neutral-500">{NOMINATION_CATEGORY_LABELS[session.category]} voting session.</p>
        </div>
        <Link href={`/cms/nominations/voting?district=${districtKey}`} className="text-sm underline">
          Back to Voting Dashboard
        </Link>
      </header>

      {searchParams?.error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {getErrorMessage(searchParams.error)}
        </div>
      )}
      {searchParams?.success && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Saved.
        </div>
      )}

      <section className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Session Settings</h2>
        <form action={saveSession} className="grid gap-3 md:grid-cols-4">
          <input type="hidden" name="district_key" value={districtKey} />
          <input name="title" defaultValue={session.title} className="rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2" />
          <input name="open_date" type="date" required defaultValue={session.open_date} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
          <input name="close_date" type="date" required defaultValue={session.close_date} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
          <select name="status_override" defaultValue={session.status_override} className="rounded border border-neutral-300 px-3 py-2 text-sm">
            <option value="auto">Auto (date-based)</option>
            <option value="force_open">Force Open</option>
            <option value="force_closed">Force Closed</option>
          </select>
          <button type="submit" className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white md:col-span-4">
            Save Settings
          </button>
        </form>
      </section>

      <section className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Live Results and Winners</h2>
        <form action={saveWinners} className="grid gap-4">
          <input type="hidden" name="district_key" value={districtKey} />
          {Array.from(finalistsByGroup.entries()).map(([group, groupFinalists]) => (
            <fieldset key={group} className="rounded border border-neutral-200 p-4">
              <legend className="px-1 text-sm font-semibold">{getVotingGroupLabel(session.category, group)}</legend>
              {groupFinalists.length === 0 ? (
                <p className="text-sm text-amber-700">Warning: no finalists in this group.</p>
              ) : (
                <div className="mt-3 grid gap-2">
                  {groupFinalists.map((finalist) => {
                    const submission = getFinalistSubmission(finalist);
                    return (
                      <label key={finalist.id} className="flex items-center justify-between gap-3 rounded border border-neutral-200 p-3 text-sm">
                        <span>
                          <span className="block font-medium">
                            {submission ? getNomineeName(submission.category, submission.payload || {}) : "Finalist"}
                          </span>
                          <span className="block text-xs text-neutral-600">{voteCounts.get(finalist.id) || 0} votes</span>
                        </span>
                        <span className="flex items-center gap-2 text-xs font-semibold uppercase text-neutral-600">
                          Winner
                          <input
                            type="radio"
                            name={`winner_${group}`}
                            value={finalist.id}
                            defaultChecked={winnerByGroup.get(group) === finalist.id}
                          />
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>
          ))}
          <button type="submit" className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
            Save Winners
          </button>
        </form>
      </section>

      <section className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Finalists</h2>
        <form action={saveFinalists} className="grid gap-4">
          <input type="hidden" name="district_key" value={districtKey} />
          {Array.from(submissionsByGroup.entries()).map(([group, groupRows]) => (
            <fieldset key={group} className="rounded border border-neutral-200 p-4">
              <legend className="px-1 text-sm font-semibold">{getVotingGroupLabel(session.category, group)}</legend>
              {groupRows.length === 0 ? (
                <p className="text-sm text-amber-700">Warning: no eligible nominees in this group.</p>
              ) : (
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {groupRows.map((row) => (
                    <label key={row.id} className="flex gap-2 rounded border border-neutral-200 p-3 text-sm">
                      <input
                        type="checkbox"
                        name="finalist"
                        value={row.id}
                        defaultChecked={selectedFinalistSubmissionIds.has(row.id)}
                      />
                      <span>
                        <span className="block font-medium">{getNomineeName(row.category, row.payload || {})}</span>
                        <span className="block text-xs text-neutral-600">{String(row.payload.why_nominate || "").slice(0, 120)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          ))}
          <button type="submit" className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
            Save Finalists
          </button>
        </form>
      </section>
    </div>
  );
}
