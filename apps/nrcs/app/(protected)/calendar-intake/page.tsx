import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireNrcsStaff } from "@/lib/auth";
import { createNrcsServerClient } from "@/lib/server";

async function reviewCandidate(form: FormData) {
  "use server";
  await requireNrcsStaff("editor");
  const db = await createNrcsServerClient();
  const action = String(form.get("action"));
  const { data, error } = await db.rpc("nrcs_review_calendar_candidate", { p_id: String(form.get("id")), p_action: action });
  if (error) redirect(`/calendar-intake?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/calendar-intake"); revalidatePath("/events");
  if (data && action === "approve") redirect(`/events/${data}?success=intake`);
  redirect(`/calendar-intake?message=${encodeURIComponent(action === "reject" ? "Candidate rejected; retained for 90 days." : "Existing Event found. Proposed changes remain staged for review; the Event was not changed.")}`);
}

export default async function CalendarIntake({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; message?: string }> }) {
  await requireNrcsStaff("editor");
  const params = await searchParams;
  const status = ["pending", "needs_attention", "approved", "rejected"].includes(params.status || "") ? params.status! : "pending";
  const db = await createNrcsServerClient();
  const { data, error } = await db.from("nrcs_calendar_candidates").select("*,nrcs_calendar_sources(name,url)")
    .eq("status", status).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(`Calendar Intake unavailable: ${error.message}`);
  return <div className="grid gap-5">
    <h1 className="text-2xl font-semibold">Calendar Intake</h1>
    <p>Approve keeps a new finding as an NRCS draft for editing. Publishing is a separate action in Events.</p>
    <Link href="/calendar-sources" className="underline">Manage sources</Link>
    <nav className="flex gap-4">{["pending", "needs_attention", "approved", "rejected"].map(s => <Link key={s} className="underline" href={`/calendar-intake?status=${s}`}>{s.replaceAll("_", " ")}</Link>)}</nav>
    {params.error && <p role="alert" className="text-red-700">{params.error}</p>}
    {params.message && <p role="status">{params.message}</p>}
    {!data?.length && <p>No candidates in this view.</p>}
    {data?.map(c => <article key={c.id} className="grid gap-3 rounded border bg-white p-4">
      <h2 className="text-lg font-semibold">{c.fields.title || "Untitled event"}</h2>
      <p className="text-sm">{c.nrcs_calendar_sources?.name} · {c.district_key} · {c.candidate_type} · {c.created_at}</p>
      <dl className="grid gap-1">{Object.entries(c.fields as Record<string, unknown>).filter(([k]) => k !== "body_html").map(([key, val]) => <div key={key}><dt className="inline font-medium">{key.replaceAll("_", " ")}: </dt><dd className="inline">{val == null ? "Unknown" : String(val)}</dd></div>)}</dl>
      {c.fields.body_html && <details><summary>Description (source HTML)</summary><pre className="whitespace-pre-wrap text-sm">{c.fields.body_html}</pre></details>}
      {c.source_excerpt && <blockquote className="whitespace-pre-wrap border-l-2 pl-3">{c.source_excerpt}</blockquote>}
      {c.nrcs_calendar_sources?.url && <a className="underline" target="_blank" rel="noreferrer" href={c.nrcs_calendar_sources.url}>Open source</a>}
      {c.event_id && <Link className="underline" href={`/events/${c.event_id}`}>Open existing Event for editorial review</Link>}
      {c.candidate_type === "update" && <p>Existing Event changes are held here. Automatic application of updates is not enabled in this phase.</p>}
      {["pending", "needs_attention"].includes(c.status) && <form action={reviewCandidate} className="flex gap-3">
        <input type="hidden" name="id" value={c.id} />
        {c.candidate_type === "new" && <button name="action" value="approve" className="rounded bg-neutral-900 px-3 py-2 text-white">Approve to draft</button>}
        <button name="action" value="reject" className="rounded border px-3 py-2">Reject</button>
      </form>}
    </article>)}
    <p className="text-sm text-neutral-500">Showing up to 100 most recent candidates in this view. Rejected records are eligible for removal after 90 days; automatic cleanup is not enabled yet.</p>
  </div>;
}
