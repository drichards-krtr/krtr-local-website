import Link from "next/link";
import { DISTRICT_OPTIONS, getDistrictConfig, parseDistrictKey } from "@/lib/districts";
import { formatDateInTimeZone } from "@/lib/dates";
import {
  getNomineeName,
  getSubmissionVotingGroup,
  getVotingGroupLabel,
} from "@/lib/nominationVoting";
import {
  NOMINATION_CATEGORY_LABELS,
  type NominationCategory,
} from "@/lib/nominations";
import { createServerSupabase } from "@/lib/supabase/server";

type Nomination = {
  id: string;
  category: NominationCategory;
  open_date: string;
  close_date: string;
};

type NominationSubmission = {
  id: string;
  nomination_id: string | null;
  category: NominationCategory;
  submitter_name: string;
  submitter_email: string;
  submitter_phone: string;
  payload: Record<string, unknown>;
  submitted_at: string;
};

export default async function VotingNominationEntriesPage({
  searchParams,
}: {
  searchParams?: { district?: string; nomination?: string };
}) {
  const districtKey = parseDistrictKey(searchParams?.district) || "dlpc";
  const district = getDistrictConfig(districtKey);
  const selectedNominationId = String(searchParams?.nomination || "");
  const supabase = createServerSupabase();

  await supabase.rpc("purge_old_nomination_submissions");

  const { data: nominationData, error: nominationError } = await supabase
    .from("nominations")
    .select("id, category, open_date, close_date")
    .eq("district_key", districtKey)
    .order("open_date", { ascending: false });

  if (nominationError) {
    throw new Error(`[VotingNominationEntriesPage:nominations] ${nominationError.message}`);
  }

  const nominations = (nominationData || []) as Nomination[];
  const selectedNomination =
    nominations.find((nomination) => nomination.id === selectedNominationId) || nominations[0] || null;

  const { data: submissionData, error: submissionError } = selectedNomination
    ? await supabase
        .from("nomination_submissions")
        .select("id, nomination_id, category, submitter_name, submitter_email, submitter_phone, payload, submitted_at")
        .eq("district_key", districtKey)
        .eq("nomination_id", selectedNomination.id)
        .order("submitted_at", { ascending: false })
    : { data: [], error: null };

  if (submissionError) {
    throw new Error(`[VotingNominationEntriesPage:submissions] ${submissionError.message}`);
  }

  const submissions = (submissionData || []) as NominationSubmission[];

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Nomination Session Entries</h1>
          <p className="text-sm text-neutral-500">Select a nomination window and review every entry from that session.</p>
          <p className="mt-1 text-sm text-neutral-600">Editing {district.name}.</p>
        </div>
        <Link href={`/cms/nominations/voting?district=${districtKey}`} className="text-sm underline">
          Back to Voting Dashboard
        </Link>
      </header>

      <form className="grid gap-4 rounded border border-neutral-200 bg-white p-4 md:grid-cols-[auto_1fr_auto]">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase text-neutral-500">District</label>
          <select name="district" defaultValue={districtKey} className="rounded border border-neutral-300 px-3 py-2 text-sm">
            {DISTRICT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase text-neutral-500">Nomination Session</label>
          <select
            name="nomination"
            defaultValue={selectedNomination?.id || ""}
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          >
            {nominations.length === 0 && <option value="">No nomination sessions</option>}
            {nominations.map((nomination) => (
              <option key={nomination.id} value={nomination.id}>
                {NOMINATION_CATEGORY_LABELS[nomination.category]}: {nomination.open_date} to {nomination.close_date}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button type="submit" className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">
            View Entries
          </button>
        </div>
      </form>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="grid grid-cols-[1.3fr_1.3fr_1.2fr_1.3fr_1fr_1fr] gap-2 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Nominee</div>
          <div>Group</div>
          <div>Submitter</div>
          <div>Contact</div>
          <div>Submitted</div>
          <div>Actions</div>
        </div>

        {!selectedNomination && (
          <div className="px-4 py-6 text-sm text-neutral-500">No nomination sessions found.</div>
        )}

        {selectedNomination && submissions.length === 0 && (
          <div className="px-4 py-6 text-sm text-neutral-500">No entries found for this nomination session.</div>
        )}

        {selectedNomination &&
          submissions.map((submission) => {
            const group = getSubmissionVotingGroup(submission.category, submission.payload || {});
            const groupLabel = group ? getVotingGroupLabel(submission.category, group) : "-";
            return (
              <div
                key={submission.id}
                className="grid grid-cols-[1.3fr_1.3fr_1.2fr_1.3fr_1fr_1fr] gap-2 border-b border-neutral-100 px-4 py-3 text-sm"
              >
                <div>
                  <div className="font-medium">{getNomineeName(submission.category, submission.payload || {}) || "-"}</div>
                  <div className="text-xs text-neutral-600">{NOMINATION_CATEGORY_LABELS[submission.category]}</div>
                </div>
                <div className="text-neutral-700">{groupLabel}</div>
                <div>{submission.submitter_name}</div>
                <div className="text-xs text-neutral-600">
                  <div>{submission.submitter_email}</div>
                  <div>{submission.submitter_phone}</div>
                </div>
                <div className="text-neutral-600">{formatDateInTimeZone(submission.submitted_at)}</div>
                <div>
                  <Link href={`/cms/nominations/submissions/${submission.id}?district=${districtKey}`} className="underline">
                    Edit
                  </Link>
                </div>
              </div>
            );
          })}
      </section>
    </div>
  );
}
