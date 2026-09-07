import Link from "next/link";
import { requireNrcsStaff } from "@/lib/auth";
import { getNrcsDistrictContext } from "@/lib/districts";
import { createNrcsServerClient } from "@/lib/server";
import { FOLLOW_UP_STATUSES } from "@/lib/workflow";
import { FollowUpCreateForm, FollowUpList, type FollowUpLogRow, type FollowUpRow } from "@/components/NrcsWorkflowPanels";

export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams?: Promise<{ district?: string; status?: string; error?: string; success?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) || {};
  const { profile } = await requireNrcsStaff("contributor");
  const { activeDistrict, allowedDistricts } = await getNrcsDistrictContext();
  const districtKey =
    resolvedSearchParams.district && allowedDistricts.some((district) => district.district_key === resolvedSearchParams.district)
      ? resolvedSearchParams.district
      : activeDistrict?.district_key || "dlpc";
  const status = FOLLOW_UP_STATUSES.includes(resolvedSearchParams.status as never) ? resolvedSearchParams.status || "open" : "open";
  const supabase = await createNrcsServerClient();

  let query = supabase
    .from("nrcs_follow_ups")
    .select("id, district_key, title, description, due_at, status, context_label, context_type, context_id")
    .eq("district_key", districtKey)
    .order("due_at", { ascending: true });

  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query.limit(100);
  if (error) throw new Error(`Unable to load Follow-Ups: ${error.message}`);

  const followUps = (data || []) as FollowUpRow[];
  const followUpIds = followUps.map((followUp) => followUp.id);
  const { data: logs } = followUpIds.length
    ? await supabase
        .from("nrcs_follow_up_activity_logs")
        .select("id, follow_up_id, activity_type, note, happened_at, backdated")
        .in("follow_up_id", followUpIds)
        .order("happened_at", { ascending: false })
    : { data: [] as FollowUpLogRow[] };
  const logsByFollowUp = new Map<string, FollowUpLogRow[]>();
  for (const log of (logs || []) as FollowUpLogRow[]) {
    logsByFollowUp.set(log.follow_up_id, [...(logsByFollowUp.get(log.follow_up_id) || []), log]);
  }
  const returnTo = `/follow-ups?district=${encodeURIComponent(districtKey)}&status=${encodeURIComponent(status)}`;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Follow-Ups</h1>
          <p className="text-sm text-neutral-500">Actionable newsroom work, due dates, and activity logs.</p>
        </div>
        <Link href="/dashboard" className="rounded border border-neutral-300 px-4 py-2 text-sm font-semibold">
          Dashboard
        </Link>
      </header>

      {resolvedSearchParams.error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{resolvedSearchParams.error}</p>}
      {resolvedSearchParams.success && <p className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">Workflow update saved.</p>}

      <form className="flex flex-wrap gap-3 rounded border border-neutral-200 bg-white p-4">
        <select name="district" defaultValue={districtKey} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {allowedDistricts.map((district) => (
            <option key={district.district_key} value={district.district_key}>
              {district.display_name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="canceled">Canceled</option>
        </select>
        <button className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">Apply</button>
      </form>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <FollowUpCreateForm districtKey={districtKey} returnTo={returnTo} />
        <FollowUpList followUps={followUps} logsByFollowUp={logsByFollowUp} profile={profile} returnTo={returnTo} />
      </div>
    </div>
  );
}
