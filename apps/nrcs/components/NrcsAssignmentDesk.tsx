import Link from "next/link";
import { redirect } from "next/navigation";
import { requireNrcsStaff } from "@/lib/auth";
import { getNrcsDistrictContext } from "@/lib/districts";
import { hasNrcsRoleAtLeast } from "@/lib/roles";
import { createNrcsServerClient } from "@/lib/server";
import { getDateTextInTimeZone, getDayRangeInTimeZone } from "@/lib/localDates";
import AssignmentDecision from "./NrcsAssignmentDecision";

export type DeskParams = {
  district?: string;
  view?: string;
  from?: string;
  to?: string;
  page?: string;
  error?: string;
  entry?: string;
};
type Mode = "assignments" | "radar";
type Entry = {
  id: string; title: string; details: string; created_at: string; archived_at?: string;
  decision?: string; decision_note?: string; story_id?: string; owner_id?: string;
  radar_id?: string; legacy_row?: Record<string, unknown>;
};
const labels: Record<string, string> = {
  pending: "Pending", skip: "Skip", hold: "Hold", need_more_info: "Need More Info", assigned: "Assigned",
  legacy_do: "Previously approved", legacy_conditional: "Previously approved with conditions",
};
const archivedDecisions = ["assigned", "legacy_do"];
const assignmentViews = {
  all: "Active pitches", pending: labels.pending, skip: labels.skip, hold: labels.hold,
  need_more_info: labels.need_more_info, legacy_conditional: labels.legacy_conditional, archived: "Archived",
};
const tables = { assignments: "nrcs_assignments", radar: "nrcs_radar" } as const;
const paths = { assignments: "/assignment-desk", radar: "/radar" } as const;
const input = "rounded border border-neutral-300 p-2";
const button = "rounded border border-neutral-300 px-3 py-2 hover:bg-neutral-100";
function isDateText(value: string | undefined): value is string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

function shiftDate(dateText: string, days: number) {
  const [year, month, day] = dateText.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export default async function NrcsAssignmentDesk({ mode, params }: { mode: Mode; params: DeskParams }) {
  const { profile } = await requireNrcsStaff();
  const producer = hasNrcsRoleAtLeast(profile.role, "producer");
  const { allowedDistricts } = await getNrcsDistrictContext();
  const district = allowedDistricts.find(item => item.district_key === params.district) ?? allowedDistricts[0];
  const radar = mode === "radar";
  const heading = radar ? "Radar" : "Assignment Desk";
  if (!district) return <p>No accessible newsroom districts.</p>;

  const districtKey = district.district_key;
  const supabase = await createNrcsServerClient();
  const views = radar ? { active: "Active", archived: "Archived" } : assignmentViews;
  const view = params.view && Object.hasOwn(views, params.view) ? params.view : radar ? "active" : "pending";
  const today = getDateTextInTimeZone(new Date(), district.timezone);
  const defaultFrom = shiftDate(today, -6);
  let from = isDateText(params.from) ? params.from : defaultFrom;
  let to = isDateText(params.to) ? params.to : today;
  if (from > to) [from, to] = [to, from];
  const page = Math.min(100000, Math.max(1, Number.parseInt(params.page || "1", 10) || 1));
  const pageSize = 25;
  const dateQuery = radar ? "" : `&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const base = `${paths[mode]}?district=${encodeURIComponent(districtKey)}&view=${view}${dateQuery}`;
  let query = supabase.from(tables[mode]).select("*").eq("district_key", districtKey);
  if (params.entry) query = query.eq("id", params.entry);
  else if (radar) query = view === "archived" ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  else {
    const fromRange = getDayRangeInTimeZone(from, district.timezone);
    const toRange = getDayRangeInTimeZone(to, district.timezone);
    query = query.gte("created_at", fromRange.startIso).lt("created_at", toRange.endIso);
    if (view === "archived") query = query.in("decision", archivedDecisions);
    else if (view !== "all") query = query.eq("decision", view);
    else query = query.not("decision", "in", `(${archivedDecisions.join(",")})`);
  }
  const ordered = query.order("created_at", { ascending: !radar });
  if (!radar) ordered.order("legacy_key");
  const [result, ownerResult] = await Promise.all([
    ordered.order("id").range((page - 1) * pageSize, page * pageSize),
    producer && !radar ? supabase.rpc("nrcs_assignment_owners", { p_district: districtKey }) : null,
  ]);
  const owners: { id: string; name: string }[] = ownerResult?.data ?? [];

  async function create(form: FormData) {
    "use server";
    await requireNrcsStaff();
    const db = await createNrcsServerClient();
    const { error } = await db.from(tables[mode]).insert({
      district_key: districtKey,
      title: String(form.get("title") || "").trim(),
      details: String(form.get("details") || "").trim(),
    });
    redirect(error ? `${base}&error=${encodeURIComponent(error.message)}` : `${paths[mode]}?district=${encodeURIComponent(districtKey)}`);
  }

  async function radarAction(id: string, archive: boolean) {
    "use server";
    await requireNrcsStaff(archive ? "producer" : "contributor");
    const db = await createNrcsServerClient();
    const { data, error } = await db.rpc("nrcs_radar_action", { p_id: id, p_archive: archive });
    if (error) redirect(`${base}&error=${encodeURIComponent(error.message)}`);
    redirect(archive ? base : `/assignment-desk?district=${encodeURIComponent(districtKey)}&entry=${data}`);
  }

  async function decide(id: string, form: FormData) {
    "use server";
    await requireNrcsStaff("producer");
    const db = await createNrcsServerClient();
    const decision = String(form.get("decision") || "");
    const { error } = await db.rpc("nrcs_decide_assignment", {
      p_id: id,
      p_decision: decision,
      p_owner: String(form.get("owner") || "") || null,
      p_note: String(form.get("note") || "").trim().slice(0, 4000),
    });
    if (!error && decision === "assigned") redirect(base);
    redirect(`${base}&entry=${id}${error ? `&error=${encodeURIComponent(error.message)}` : ""}`);
  }

  const rows = (result.data || []) as unknown as Entry[];
  const dates = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: district.timezone });
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-2xl font-semibold">{heading}</h1>
      <form className="flex flex-wrap items-end gap-3 text-sm">
        <label className="grid gap-1">District
          <select name="district" className={input} defaultValue={districtKey}>
            {allowedDistricts.map(item => <option key={item.district_key} value={item.district_key}>{item.display_name}</option>)}
          </select>
        </label>
        <label className="grid gap-1">{radar ? "Status" : "Decision"}
          <select name="view" className={input} defaultValue={view}>
            {Object.entries(views).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        {!radar && <>
          <label className="grid gap-1">Created from<input type="date" name="from" className={input} defaultValue={from} /></label>
          <label className="grid gap-1">Created through<input type="date" name="to" className={input} defaultValue={to} /></label>
        </>}
        <button className={button}>Filter</button>
        {params.entry && <Link href={base} className={button}>Back to list</Link>}
      </form>
      {(params.error || result.error || ownerResult?.error) && (
        <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{params.error || result.error?.message || ownerResult?.error?.message}</p>
      )}
      <details className="rounded border bg-white p-4">
        <summary className="cursor-pointer font-medium">{radar ? "Add Radar entry" : "Submit a pitch"}</summary>
        <form action={create} className="mt-3 grid gap-3 text-sm">
          <label className="grid gap-1">Title<input name="title" className={input} required maxLength={500} /></label>
          <label className="grid gap-1">Details and sources<textarea name="details" className={input} rows={4} maxLength={24000} /></label>
          <button className={`${button} justify-self-start`}>Add entry</button>
        </form>
      </details>
      {!rows.length && !result.error && <p className="text-sm text-neutral-600">No entries match this view.</p>}
      {rows.slice(0, pageSize).map(row => (
        <article key={row.id} className="space-y-3 rounded border bg-white p-4 text-sm">
          <div>
            <h2 className="text-lg font-semibold">{row.title}</h2>
            <p className="text-neutral-600">{dates.format(new Date(row.created_at))} · {radar ? row.archived_at ? "Archived" : "Active" : labels[row.decision || "pending"]}</p>
          </div>
          {row.details && <p className="whitespace-pre-wrap break-words">{row.details}</p>}
          {row.radar_id && <Link className="underline" href={`/radar?district=${encodeURIComponent(districtKey)}&entry=${row.radar_id}`}>Source Radar entry</Link>}
          {row.legacy_row && <details><summary>Original workbook entry</summary>
            <dl className="mt-2 grid gap-2">{Object.entries(row.legacy_row).map(([key, value]) => (
              <div key={key}><dt className="font-medium">{key}</dt><dd className="whitespace-pre-wrap break-words">{typeof value === "object" ? JSON.stringify(value) : String(value ?? "")}</dd></div>
            ))}</dl>
          </details>}
          {radar && !row.archived_at && (
            <div className="flex flex-wrap gap-2">
              <form action={radarAction.bind(null, row.id, false)}><button className={button}>Create Assignment Desk entry</button></form>
              {producer && <form action={radarAction.bind(null, row.id, true)}><button className={button}>Archive Radar entry</button></form>}
            </div>
          )}
          {row.story_id && <div className="flex flex-wrap gap-3">
            <Link href={`/stories/${row.story_id}?district=${encodeURIComponent(districtKey)}`} className="underline">Open linked story</Link>
            {owners.find(owner => owner.id === row.owner_id)?.name}
          </div>}
          {row.decision_note && <p className="whitespace-pre-wrap text-neutral-600">{row.decision_note}</p>}
          {producer && !radar && !row.story_id && !archivedDecisions.includes(row.decision || "pending") && (
            <AssignmentDecision action={decide.bind(null, row.id)} decision={row.decision || "pending"} note={row.decision_note || ""} owners={owners} />
          )}
        </article>
      ))}
      {!params.entry && <div className="flex gap-2 text-sm">
        {page > 1 && <Link className={button} href={`${base}&page=${page - 1}`}>Previous</Link>}
        {rows.length > pageSize && <Link className={button} href={`${base}&page=${page + 1}`}>Next</Link>}
      </div>}
    </div>
  );
}
