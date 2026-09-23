import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireNrcsStaff } from "@/lib/auth";
import { createNrcsServerClient } from "@/lib/server";
import { CALENDAR_ADAPTERS } from "@/lib/calendarIngestion";

async function saveSource(form: FormData) {
  "use server";
  await requireNrcsStaff("editor");
  const get = (key: string) => String(form.get(key) || "").trim();
  let error = "";
  const adapter = get("adapter_type");
  if (!(CALENDAR_ADAPTERS as readonly string[]).includes(adapter)) error = "Unknown adapter.";
  for (const key of ["url", "feed_url"]) {
    if (key === "feed_url" && !get(key)) continue;
    try { const u = new URL(get(key)); if (!["https:", "http:"].includes(u.protocol) || u.username || u.password) error = "Use public HTTP(S) source URLs without credentials."; }
    catch { error = "A valid source URL is required."; }
  }
  if (!get("name") || get("name").length > 200 || get("extraction_notes").length > 10000) error = "Provide a source name (up to 200 characters) and notes under 10,000 characters.";
  if (error) redirect(`/calendar-sources?error=${encodeURIComponent(error)}`);
  const db = await createNrcsServerClient();
  if (get("default_event_type_id")) {
    const { data: term } = await db.from("nrcs_event_classification_terms").select("id")
      .eq("id", get("default_event_type_id")).eq("district_key", get("district_key")).maybeSingle();
    if (!term) redirect("/calendar-sources?error=Classification%20must%20belong%20to%20the%20source%20district.");
  }
  const write = { name: get("name"), district_key: get("district_key"), adapter_type: adapter,
    url: get("url"), feed_url: get("feed_url") || null, provider: get("provider") || null,
    extraction_notes: get("extraction_notes") || null, default_event_type_id: get("default_event_type_id") || null, enabled: form.get("enabled") === "on" };
  const result = get("id") ? await db.from("nrcs_calendar_sources").update(write).eq("id", get("id")).select("id").single()
    : await db.from("nrcs_calendar_sources").insert(write).select("id").single();
  if (result.error) redirect(`/calendar-sources?error=${encodeURIComponent(result.error.message)}`);
  revalidatePath("/calendar-sources");
  redirect("/calendar-sources?saved=1");
}

export default async function CalendarSources({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireNrcsStaff("editor");
  const params = await searchParams;
  const db = await createNrcsServerClient();
  const [{ data: sources, error }, { data: districts }, { data: runs }, { data: terms }] = await Promise.all([
    db.from("nrcs_calendar_sources").select("*").order("name"),
    db.from("nrcs_districts").select("district_key,display_name,enabled").order("display_name"),
    db.from("nrcs_calendar_source_runs").select("id,source_id,status,completed_at,events_found,new_candidates,error_message").order("completed_at", { ascending: false }).limit(20),
    db.from("nrcs_event_classification_terms").select("id,name,district_key,enabled").order("name"),
  ]);
  if (error) throw new Error(`Calendar registry unavailable: ${error.message}`);
  function sourceForm(source?: NonNullable<typeof sources>[number]) {
    return <form action={saveSource} className="grid gap-3 rounded border bg-white p-4">
      <input type="hidden" name="id" value={source?.id || ""} />
      <label>Name<input className="block w-full rounded border p-2" name="name" required maxLength={200} defaultValue={source?.name || ""} /></label>
      <div className="grid gap-3 md:grid-cols-2">
        <label>District<select className="block w-full rounded border p-2" name="district_key" defaultValue={source?.district_key || "dlpc"}>{districts?.map(d => <option key={d.district_key} value={d.district_key}>{d.display_name}{d.enabled ? "" : " (disabled)"}</option>)}</select></label>
        <label>Adapter<select className="block w-full rounded border p-2" name="adapter_type" defaultValue={source?.adapter_type || "ical"}>{CALENDAR_ADAPTERS.map(a => <option key={a}>{a}</option>)}</select></label>
      </div>
      <label>Source page URL<input className="block w-full rounded border p-2" type="url" name="url" required defaultValue={source?.url || ""} /></label>
      <label>Feed URL (if different)<input className="block w-full rounded border p-2" type="url" name="feed_url" defaultValue={source?.feed_url || ""} /></label>
      <label>Provider (optional)<input className="block w-full rounded border p-2" name="provider" defaultValue={source?.provider || ""} /></label>
      <label>Default Event type<select className="block w-full rounded border p-2" name="default_event_type_id" defaultValue={source?.default_event_type_id || ""}><option value="">Unknown / choose during editing</option>{terms?.map(t => <option key={t.id} value={t.id}>{t.name} · {t.district_key}{t.enabled ? "" : " (disabled; blocks approval)"}</option>)}</select></label>
      <label>Extraction notes<textarea className="block w-full rounded border p-2" name="extraction_notes" maxLength={10000} defaultValue={source?.extraction_notes || ""} /></label>
      <label><input type="checkbox" name="enabled" defaultChecked={source?.enabled || false} /> Enabled for ingestion</label>
      <button className="w-fit rounded bg-neutral-900 px-4 py-2 text-white">{source ? "Save source" : "Add source"}</button>
    </form>;
  }
  return <div className="grid gap-5">
    <h1 className="text-2xl font-semibold">Calendar Sources</h1>
    <p>Manage sources for the 90-day calendar intake window. Scheduled scans and Run Now will be connected with the adapters in the next phase.</p>
    <Link className="underline" href="/calendar-intake">Review Calendar Intake</Link>
    {params.error && <p role="alert" className="text-red-700">{params.error}</p>}
    {params.saved && <p role="status">Source saved.</p>}
    <details><summary className="cursor-pointer font-semibold">Add source</summary>{sourceForm()}</details>
    {sources?.map(s => <details key={s.id} className="rounded border p-4"><summary className="cursor-pointer font-semibold">{s.name} · {s.enabled ? "Enabled" : "Disabled"} · {s.last_status || "Not scanned"}</summary>
      <p className="my-2 text-sm">Source ID: {s.id} · Last success: {s.last_success_at || "Never"}</p>
      {s.last_error && <p className="text-red-700">{s.last_error}</p>}{sourceForm(s)}</details>)}
    <h2 className="text-lg font-semibold">Recent scans</h2>
    {!runs?.length && <p>No scans recorded yet.</p>}
    {runs?.map(r => <div key={r.id} className="rounded border p-3"><strong>{sources?.find(s => s.id === r.source_id)?.name || r.source_id}</strong> · {r.status} · {r.completed_at}<p>{r.events_found} findings · {r.new_candidates} new review items</p>{r.error_message && <p>{r.error_message}</p>}</div>)}
  </div>;
}
