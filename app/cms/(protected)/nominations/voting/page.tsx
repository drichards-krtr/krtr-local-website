import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DISTRICT_OPTIONS, getDistrictConfig, parseDistrictKey, type DistrictKey } from "@/lib/districts";
import {
  FINALISTS_PER_GROUP_MAX,
  getNomineeName,
  getSubmissionVotingGroup,
  getVotingGroupLabel,
  getVotingGroupsForCategory,
  getVotingSessionDefaultTitle,
  slugifyVotingSession,
  votingSessionIsOpenInCentralTime,
  type VotingSession,
} from "@/lib/nominationVoting";
import {
  NOMINATION_CATEGORIES,
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
  category: NominationCategory;
  payload: Record<string, unknown>;
  submitted_at: string;
};

type Finalist = {
  id: string;
  session_id: string;
  nomination_submission_id: string;
  voting_group: string;
};

type Vote = {
  session_id: string;
  finalist_id: string;
  voting_group: string;
};

type Winner = {
  session_id: string;
  finalist_id: string;
  voting_group: string;
};

function getErrorMessage(error: string) {
  if (error.includes("overlaps")) return "Voting dates overlap an existing session. Only one voting session can be scheduled at a time.";
  if (error.includes("already open")) return "Another voting session is already open.";
  if (error.includes("four finalists")) return "Voting sessions can include no more than four finalists per group.";
  return error;
}

function revalidateVotingPaths(districtKey: DistrictKey, slug?: string) {
  revalidatePath("/");
  revalidatePath("/cms/nominations/voting");
  revalidatePath(`/cms/nominations/voting?district=${districtKey}`);
  if (slug) revalidatePath(`/nominations/vote/${slug}`);
}

function countBy<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = key(item);
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

export default async function NominationVotingPage({
  searchParams,
}: {
  searchParams?: { district?: string; category?: string; error?: string; success?: string };
}) {
  const districtKey = parseDistrictKey(searchParams?.district) || "dlpc";
  const district = getDistrictConfig(districtKey);
  const selectedCategory = NOMINATION_CATEGORIES.includes(searchParams?.category as NominationCategory)
    ? (searchParams?.category as NominationCategory)
    : "athletes";
  const supabase = createServerSupabase();

  await supabase.rpc("purge_old_nomination_submissions");

  const [{ data: sessionData, error: sessionError }, { data: latestNominationData }] = await Promise.all([
    supabase
      .from("nomination_voting_sessions")
      .select("id, district_key, nomination_id, category, slug, title, open_date, close_date, status_override, created_at")
      .eq("district_key", districtKey)
      .order("open_date", { ascending: false }),
    supabase
      .from("nominations")
      .select("id, category, open_date, close_date")
      .eq("district_key", districtKey)
      .eq("category", selectedCategory)
      .order("open_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (sessionError) {
    throw new Error(`[NominationVotingPage] ${sessionError.message}`);
  }

  const sessions = (sessionData || []) as VotingSession[];
  const latestNomination = latestNominationData as Nomination | null;

  const [{ data: submissionsData }, { data: finalistsData }, { data: votesData }, { data: winnersData }] =
    await Promise.all([
      latestNomination
        ? supabase
            .from("nomination_submissions")
            .select("id, category, payload, submitted_at")
            .eq("district_key", districtKey)
            .eq("nomination_id", latestNomination.id)
            .eq("category", selectedCategory)
            .order("submitted_at", { ascending: true })
        : Promise.resolve({ data: [] }),
      sessions.length
        ? supabase
            .from("nomination_voting_finalists")
            .select("id, session_id, nomination_submission_id, voting_group")
            .in("session_id", sessions.map((session) => session.id))
        : Promise.resolve({ data: [] }),
      sessions.length
        ? supabase
            .from("nomination_votes")
            .select("session_id, finalist_id, voting_group")
            .in("session_id", sessions.map((session) => session.id))
        : Promise.resolve({ data: [] }),
      sessions.length
        ? supabase
            .from("nomination_voting_winners")
            .select("session_id, finalist_id, voting_group")
            .in("session_id", sessions.map((session) => session.id))
        : Promise.resolve({ data: [] }),
    ]);

  const submissions = ((submissionsData || []) as NominationSubmission[]).filter((row) => {
    const group = getSubmissionVotingGroup(row.category, row.payload || {});
    return getNomineeName(row.category, row.payload || {}) && getVotingGroupsForCategory(row.category).includes(group);
  });
  const finalists = (finalistsData || []) as Finalist[];
  const votes = (votesData || []) as Vote[];
  const winners = (winnersData || []) as Winner[];
  const finalistsBySession = countBy(finalists, (row) => row.session_id);
  const votesBySession = countBy(votes, (row) => row.session_id);
  const winnersBySession = countBy(winners, (row) => row.session_id);

  const groupedSubmissions = new Map<string, NominationSubmission[]>();
  for (const group of getVotingGroupsForCategory(selectedCategory)) groupedSubmissions.set(group, []);
  for (const submission of submissions) {
    const group = getSubmissionVotingGroup(submission.category, submission.payload || {});
    groupedSubmissions.set(group, [...(groupedSubmissions.get(group) || []), submission]);
  }

  async function createSession(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;
    const category = String(formData.get("category") || "") as NominationCategory;
    const nominationId = String(formData.get("nomination_id") || "");
    const openDate = String(formData.get("open_date") || "");
    const closeDate = String(formData.get("close_date") || "");
    const statusOverride = String(formData.get("status_override") || "auto");
    const selectedFinalists = formData.getAll("finalist").map(String).filter(Boolean);

    if (!selectedFinalists.length) {
      redirect(`/cms/nominations/voting?district=${nextDistrictKey}&category=${category}&error=${encodeURIComponent("Choose at least one finalist.")}`);
    }

    const { data: selectedRows, error: selectedError } = await service
      .from("nomination_submissions")
      .select("id, category, payload")
      .eq("district_key", nextDistrictKey)
      .eq("nomination_id", nominationId)
      .in("id", selectedFinalists);

    if (selectedError) {
      redirect(`/cms/nominations/voting?district=${nextDistrictKey}&category=${category}&error=${encodeURIComponent(selectedError.message)}`);
    }

    const finalistRows = ((selectedRows || []) as NominationSubmission[]).map((row, index) => ({
      nomination_submission_id: row.id,
      voting_group: getSubmissionVotingGroup(row.category, row.payload || {}),
      sort_order: index + 1,
    }));
    const groupCounts = countBy(finalistRows, (row) => row.voting_group);
    const overLimit = Array.from(groupCounts.values()).some((count) => count > FINALISTS_PER_GROUP_MAX);
    if (overLimit) {
      redirect(`/cms/nominations/voting?district=${nextDistrictKey}&category=${category}&error=${encodeURIComponent("Voting sessions can include no more than four finalists per group.")}`);
    }

    const slug = slugifyVotingSession(category, openDate);
    const { data: session, error: sessionError } = await service
      .from("nomination_voting_sessions")
      .insert({
        district_key: nextDistrictKey,
        nomination_id: nominationId,
        category,
        slug,
        title: String(formData.get("title") || "").trim() || getVotingSessionDefaultTitle(category),
        open_date: openDate,
        close_date: closeDate,
        status_override: statusOverride,
      })
      .select("id, slug")
      .single();

    if (sessionError) {
      redirect(`/cms/nominations/voting?district=${nextDistrictKey}&category=${category}&error=${encodeURIComponent(sessionError.message)}`);
    }

    const { error: finalistError } = await service.from("nomination_voting_finalists").insert(
      finalistRows.map((row) => ({
        session_id: session.id,
        ...row,
      }))
    );

    if (finalistError) {
      await service.from("nomination_voting_sessions").delete().eq("id", session.id);
      redirect(`/cms/nominations/voting?district=${nextDistrictKey}&category=${category}&error=${encodeURIComponent(finalistError.message)}`);
    }

    revalidateVotingPaths(nextDistrictKey, session.slug);
    redirect(`/cms/nominations/voting?district=${nextDistrictKey}&success=created`);
  }

  async function quickUpdate(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const id = String(formData.get("id") || "");
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;
    const statusOverride = String(formData.get("status_override") || "auto");

    const { data: session } = await service
      .from("nomination_voting_sessions")
      .select("slug")
      .eq("id", id)
      .eq("district_key", nextDistrictKey)
      .maybeSingle();
    const { error } = await service
      .from("nomination_voting_sessions")
      .update({ status_override: statusOverride })
      .eq("id", id)
      .eq("district_key", nextDistrictKey);

    if (error) {
      redirect(`/cms/nominations/voting?district=${nextDistrictKey}&error=${encodeURIComponent(error.message)}`);
    }

    revalidateVotingPaths(nextDistrictKey, String(session?.slug || ""));
    redirect(`/cms/nominations/voting?district=${nextDistrictKey}&success=updated`);
  }

  async function deleteSession(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const id = String(formData.get("id") || "");
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;
    const { data: session } = await service
      .from("nomination_voting_sessions")
      .select("slug")
      .eq("id", id)
      .eq("district_key", nextDistrictKey)
      .maybeSingle();
    const { error } = await service
      .from("nomination_voting_sessions")
      .delete()
      .eq("id", id)
      .eq("district_key", nextDistrictKey);
    if (error) {
      redirect(`/cms/nominations/voting?district=${nextDistrictKey}&error=${encodeURIComponent(error.message)}`);
    }
    revalidateVotingPaths(nextDistrictKey, String(session?.slug || ""));
    redirect(`/cms/nominations/voting?district=${nextDistrictKey}&success=deleted`);
  }

  async function deleteVotes(formData: FormData) {
    "use server";
    const service = createServerSupabase();
    const id = String(formData.get("id") || "");
    const nextDistrictKey = parseDistrictKey(String(formData.get("district_key") || "")) || districtKey;
    const { error } = await service.from("nomination_votes").delete().eq("session_id", id);
    if (error) {
      redirect(`/cms/nominations/voting?district=${nextDistrictKey}&error=${encodeURIComponent(error.message)}`);
    }
    revalidateVotingPaths(nextDistrictKey);
    redirect(`/cms/nominations/voting?district=${nextDistrictKey}&success=votes-deleted`);
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Nomination Voting</h1>
          <p className="text-sm text-neutral-500">Create finalist voting sessions, monitor live totals, and retain manual winners.</p>
          <p className="mt-1 text-sm text-neutral-600">Editing {district.name}.</p>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/cms/nominations/voting/entries?district=${districtKey}`}
            className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-900"
          >
            View Session Entries
          </Link>
          <Link
            href={`/cms/nominations/voting/winners?district=${districtKey}`}
            className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-900"
          >
            Winners
          </Link>
          <Link href={`/cms/nominations?district=${districtKey}`} className="text-sm underline">
            Back to Nominations
          </Link>
        </div>
      </header>

      {searchParams?.error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {getErrorMessage(searchParams.error)}
        </div>
      )}
      {searchParams?.success && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Voting session saved.
        </div>
      )}

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

      <section className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Create Voting Session</h2>
        <form className="mb-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="district" value={districtKey} />
          <div className="grid gap-1">
            <label className="text-xs font-semibold uppercase text-neutral-500">Category</label>
            <select name="category" defaultValue={selectedCategory} className="rounded border border-neutral-300 px-3 py-2 text-sm">
              {NOMINATION_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {NOMINATION_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">
            Load Nominees
          </button>
        </form>

        {!latestNomination ? (
          <p className="text-sm text-neutral-600">No nomination window exists for this category.</p>
        ) : (
          <form action={createSession} className="grid gap-4">
            <input type="hidden" name="district_key" value={districtKey} />
            <input type="hidden" name="category" value={selectedCategory} />
            <input type="hidden" name="nomination_id" value={latestNomination.id} />
            <div className="grid gap-3 md:grid-cols-4">
              <input
                name="title"
                defaultValue={getVotingSessionDefaultTitle(selectedCategory)}
                className="rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
              />
              <input name="open_date" type="date" required className="rounded border border-neutral-300 px-3 py-2 text-sm" />
              <input name="close_date" type="date" required className="rounded border border-neutral-300 px-3 py-2 text-sm" />
              <select name="status_override" defaultValue="auto" className="rounded border border-neutral-300 px-3 py-2 text-sm">
                <option value="auto">Auto (date-based)</option>
                <option value="force_open">Force Open</option>
                <option value="force_closed">Force Closed</option>
              </select>
            </div>

            <p className="text-sm text-neutral-600">
              Selecting from the most recent {NOMINATION_CATEGORY_LABELS[selectedCategory]} nomination window:
              {" "}
              {latestNomination.open_date} to {latestNomination.close_date}. Max {FINALISTS_PER_GROUP_MAX} finalists per group.
            </p>

            <div className="grid gap-4">
              {Array.from(groupedSubmissions.entries()).map(([group, groupRows]) => (
                <fieldset key={group} className="rounded border border-neutral-200 p-4">
                  <legend className="px-1 text-sm font-semibold">{getVotingGroupLabel(selectedCategory, group)}</legend>
                  {groupRows.length === 0 ? (
                    <p className="text-sm text-amber-700">Warning: no eligible nominees in this group.</p>
                  ) : (
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {groupRows.map((row) => (
                        <label key={row.id} className="flex gap-2 rounded border border-neutral-200 p-3 text-sm">
                          <input type="checkbox" name="finalist" value={row.id} />
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
            </div>

            <button type="submit" className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
              Create Voting Session
            </button>
          </form>
        )}
      </section>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1.8fr] gap-2 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Session</div>
          <div>Open</div>
          <div>Close</div>
          <div>Status</div>
          <div>Totals</div>
          <div>Actions</div>
        </div>
        {sessions.length === 0 && <div className="px-4 py-6 text-sm text-neutral-500">No voting sessions yet.</div>}
        {sessions.map((session) => {
          const isOpen = votingSessionIsOpenInCentralTime(session);
          const statusText =
            session.status_override === "force_open"
              ? "Force Open"
              : session.status_override === "force_closed"
                ? "Force Closed"
                : isOpen
                  ? "Open"
                  : "Closed";
          return (
            <div key={session.id} className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1.8fr] gap-2 border-b border-neutral-100 px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{session.title}</div>
                <div className="text-xs text-neutral-600">{NOMINATION_CATEGORY_LABELS[session.category]}</div>
              </div>
              <div className="text-neutral-600">{session.open_date}</div>
              <div className="text-neutral-600">{session.close_date}</div>
              <div>{statusText}</div>
              <div className="text-xs text-neutral-700">
                <div>{finalistsBySession.get(session.id) || 0} finalists</div>
                <div>{votesBySession.get(session.id) || 0} votes</div>
                <div>{winnersBySession.get(session.id) || 0} winners</div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/cms/nominations/voting/${session.id}?district=${districtKey}`} className="underline">
                  Edit/Results
                </Link>
                <a href={`/api/nominations/votes-export?district=${districtKey}&session=${session.id}`} className="underline">
                  CSV
                </a>
                <form action={quickUpdate}>
                  <input type="hidden" name="id" value={session.id} />
                  <input type="hidden" name="district_key" value={districtKey} />
                  <input type="hidden" name="status_override" value="auto" />
                  <button type="submit" className="text-neutral-500 underline">Auto</button>
                </form>
                <form action={quickUpdate}>
                  <input type="hidden" name="id" value={session.id} />
                  <input type="hidden" name="district_key" value={districtKey} />
                  <input type="hidden" name="status_override" value="force_open" />
                  <button type="submit" className="text-neutral-500 underline">Force Open</button>
                </form>
                <form action={quickUpdate}>
                  <input type="hidden" name="id" value={session.id} />
                  <input type="hidden" name="district_key" value={districtKey} />
                  <input type="hidden" name="status_override" value="force_closed" />
                  <button type="submit" className="text-neutral-500 underline">Force Closed</button>
                </form>
                <form action={deleteVotes}>
                  <input type="hidden" name="id" value={session.id} />
                  <input type="hidden" name="district_key" value={districtKey} />
                  <button type="submit" className="text-red-700 underline">Delete Votes</button>
                </form>
                <form action={deleteSession}>
                  <input type="hidden" name="id" value={session.id} />
                  <input type="hidden" name="district_key" value={districtKey} />
                  <button type="submit" className="text-red-700 underline">Delete Session</button>
                </form>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
