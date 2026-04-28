import Link from "next/link";
import { DISTRICT_OPTIONS, getDistrictConfig, parseDistrictKey } from "@/lib/districts";
import { formatDateInTimeZone } from "@/lib/dates";
import {
  getNomineeName,
  getVotingGroupLabel,
} from "@/lib/nominationVoting";
import {
  NOMINATION_CATEGORY_LABELS,
  type NominationCategory,
} from "@/lib/nominations";
import { createServerSupabase } from "@/lib/supabase/server";

type VotingSession = {
  id: string;
  category: NominationCategory;
  title: string;
  open_date: string;
  close_date: string;
};

type NominationSubmission = {
  id: string;
  category: NominationCategory;
  payload: Record<string, unknown>;
};

type Finalist = {
  id: string;
  nomination_submission_id: string;
  nomination_submissions?: NominationSubmission | NominationSubmission[];
};

type Winner = {
  id: string;
  session_id: string;
  finalist_id: string;
  voting_group: string;
  selected_at: string;
  nomination_voting_sessions?: VotingSession | VotingSession[];
  nomination_voting_finalists?: Finalist | Finalist[];
};

function getSingle<T>(value: T | T[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function VotingWinnersPage({
  searchParams,
}: {
  searchParams?: { district?: string };
}) {
  const districtKey = parseDistrictKey(searchParams?.district) || "dlpc";
  const district = getDistrictConfig(districtKey);
  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from("nomination_voting_winners")
    .select(
      "id, session_id, finalist_id, voting_group, selected_at, nomination_voting_sessions!inner(id, category, title, open_date, close_date, district_key), nomination_voting_finalists(id, nomination_submission_id, nomination_submissions(id, category, payload))"
    )
    .eq("nomination_voting_sessions.district_key", districtKey)
    .order("selected_at", { ascending: false });

  if (error) {
    throw new Error(`[VotingWinnersPage] ${error.message}`);
  }

  const winners = ((data || []) as Winner[]).sort((a, b) => {
    const sessionA = getSingle(a.nomination_voting_sessions);
    const sessionB = getSingle(b.nomination_voting_sessions);
    const closeCompare = String(sessionB?.close_date || "").localeCompare(String(sessionA?.close_date || ""));
    if (closeCompare !== 0) return closeCompare;
    return String(b.selected_at || "").localeCompare(String(a.selected_at || ""));
  });

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Nomination Winners</h1>
          <p className="text-sm text-neutral-500">Manual winners retained across voting sessions, newest to oldest.</p>
          <p className="mt-1 text-sm text-neutral-600">Editing {district.name}.</p>
        </div>
        <Link href={`/cms/nominations/voting?district=${districtKey}`} className="text-sm underline">
          Back to Voting Dashboard
        </Link>
      </header>

      <form className="rounded border border-neutral-200 bg-white p-4">
        <label className="mb-2 block text-xs font-semibold uppercase text-neutral-500">District</label>
        <select name="district" defaultValue={districtKey} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {DISTRICT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button type="submit" className="ml-3 rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">
          Switch
        </button>
      </form>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="grid grid-cols-[1.3fr_1.2fr_1.2fr_1.4fr_1fr_1fr] gap-2 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Winner</div>
          <div>Category</div>
          <div>Group</div>
          <div>Session</div>
          <div>Selected</div>
          <div>Actions</div>
        </div>

        {winners.length === 0 && (
          <div className="px-4 py-6 text-sm text-neutral-500">No winners selected yet.</div>
        )}

        {winners.map((winner) => {
          const session = getSingle(winner.nomination_voting_sessions);
          const finalist = getSingle(winner.nomination_voting_finalists);
          const submission = getSingle(finalist?.nomination_submissions);
          const category = session?.category || submission?.category || "leaders";
          return (
            <div
              key={winner.id}
              className="grid grid-cols-[1.3fr_1.2fr_1.2fr_1.4fr_1fr_1fr] gap-2 border-b border-neutral-100 px-4 py-3 text-sm"
            >
              <div className="font-medium">
                {submission ? getNomineeName(submission.category, submission.payload || {}) : "Winner"}
              </div>
              <div>{NOMINATION_CATEGORY_LABELS[category]}</div>
              <div>{getVotingGroupLabel(category, winner.voting_group)}</div>
              <div>
                <div>{session?.title || "Voting Session"}</div>
                <div className="text-xs text-neutral-600">
                  {session?.open_date || "-"} to {session?.close_date || "-"}
                </div>
              </div>
              <div className="text-neutral-600">{formatDateInTimeZone(winner.selected_at)}</div>
              <div>
                {session && (
                  <Link href={`/cms/nominations/voting/${session.id}?district=${districtKey}`} className="underline">
                    Session
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
