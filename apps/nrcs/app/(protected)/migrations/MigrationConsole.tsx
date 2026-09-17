"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Run = { id: string; district_key: string; phase: string; mode: string; created_at: string; last_error: string | null; source_counts: Record<string, number>; source_audit: Record<string, number> };
type Item = { id: string; kind: string; source_id: string; status: string; detail: string | null; errors: string[]; warnings: string[]; normalized: { title?: string; name?: string; body_html?: string; owner_id?: string | null; classification_target_id?: string | null; district_key?: string; is_school_sports?: boolean; slug?: string; image_url?: string } };
type Owner = { id: string; email: string };
type Term = { id: string; district_key: string; kind: string; name: string };
type Tag = { id: string; name: string; slug: string };
type Report = { runs: Run[]; run?: Run; items?: Item[]; legacyTags?: { slug: string; name: string }[]; count?: number; page?: number; summary?: { total: number; issues: number; warnings: number; statuses: Record<string, number>; kinds: Record<string, number> } };

async function api(body?: Record<string, unknown>, query = "") {
  const response = await fetch(`/api/migrations${query}`, { method: body ? "POST" : "GET", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}), cache: "no-store", signal: AbortSignal.timeout(70000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Migration request failed.");
  return data;
}

export default function MigrationConsole({ districts, defaultDistrict, owners, terms, tags }: { districts: { key: string; name: string }[]; defaultDistrict: string; owners: Owner[]; terms: Term[]; tags: Tag[] }) {
  const [district, setDistrict] = useState(defaultDistrict || districts[0]?.key || "");
  const [selected, setSelected] = useState("");
  const [report, setReport] = useState<Report>({ runs: [] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [mode, setMode] = useState("import");
  const [page, setPage] = useState(0);
  const [legacySlug, setLegacySlug] = useState("");
  const [canonicalTag, setCanonicalTag] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingTags, setPendingTags] = useState<Record<string, string>>({});
  const [currentTags, setCurrentTags] = useState(tags);
  const active = useRef(false);
  const mounted = useRef(true);
  const reload = useCallback(async (id = selected, index = page) => {
    const data = await api(undefined, id ? `?run=${encodeURIComponent(id)}&page=${index}` : "");
    if (mounted.current) { setReport(data); if (data.canonicalTags) setCurrentTags(data.canonicalTags); }
    return data as Report;
  }, [selected, page]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current = false; }; }, []);
  useEffect(() => { reload().catch(exception => { if (mounted.current) setError(String(exception)); }); }, [reload]);
  useEffect(() => { setPendingTags({}); }, [selected]);

  async function process(id: string) {
    if (active.current) return;
    active.current = true; setRunning(true); setBusy(true); setError("");
    try {
      while (active.current) {
        const current = await reload(id, 0);
        if (!current.run || !["scan", "import"].includes(current.run.phase)) break;
        await api({ action: "step", run: id });
        await reload(id, 0);
      }
    } catch (exception) { if (mounted.current) setError(exception instanceof Error ? exception.message : "Batch failed."); }
    finally { active.current = false; if (mounted.current) { setRunning(false); setBusy(false); } }
  }
  async function start() {
    setBusy(true); setError("");
    try { const result = await api({ action: "start", district }); setSelected(result.run.id); setPage(0); }
    catch (exception) { setError(String(exception)); }
    finally { setBusy(false); }
  }
  async function beginImport() {
    setBusy(true); setError("");
    try { await api({ action: "import", run: selected, confirmation, mode }); setConfirmation(""); await reload(); }
    catch (exception) { setError(String(exception)); }
    finally { setBusy(false); }
  }
  async function stopRun() {
    setBusy(true); setError("");
    try { await api({ action: "cancel", run: selected }); await reload(); }
    catch (exception) { setError(String(exception)); }
    finally { setBusy(false); }
  }
  async function saveMapping(item: Item, form: FormData) {
    setBusy(true); setError("");
    try {
      await api({ action: "mapping", run: selected, item: item.id, owner_id: form.get("owner_id"), ...(item.kind === "events" ? { classification_target_id: form.get("classification_target_id") } : {}) });
      await reload();
    } catch (exception) { setError(String(exception)); }
    finally { setBusy(false); }
  }
  async function resolveTag() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api({ action: "tag_mapping", run: selected, mappings: Object.entries(pendingTags).map(([source_slug, tag_id]) => ({ source_slug, tag_id })) });
      setSelected(result.run.id); setPage(0);
      setNotice("Tag mappings saved together. A refreshed dry run is ready to process.");
      setLegacySlug(""); setCanonicalTag("");
    } catch (exception) { setError(exception instanceof Error ? exception.message : "Tag mapping failed."); }
    finally { setBusy(false); }
  }
  const run = report.run;
  return <div className="space-y-6">
    <h1 className="text-2xl font-semibold">Content Migration</h1>
    {error && <p role="alert" className="border border-red-500 bg-red-50 p-3">{error}</p>}
    {notice && <p role="status" className="border border-green-600 bg-green-50 p-3">{notice}</p>}
    <section className="flex flex-wrap items-end gap-3 border-b pb-5">
      <label className="grid gap-1 text-sm">District<select value={district} onChange={event => setDistrict(event.target.value)} disabled={busy} className="rounded border p-2">{districts.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label>
      <button onClick={start} disabled={busy || !district} className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50">Create Dry Run</button>
    </section>
    <label className="grid max-w-xl gap-1 text-sm">Migration Run<select value={selected} disabled={busy} onChange={event => { setSelected(event.target.value); setPage(0); setError(""); }} className="rounded border p-2"><option value="">Select Run</option>{report.runs.map(item => <option key={item.id} value={item.id}>{item.district_key} - {item.mode} - {item.phase} - {new Date(item.created_at).toLocaleString()}</option>)}</select></label>
    {run && <>
      <div role="status" className="flex flex-wrap items-center gap-4 border-y py-3"><strong>{run.district_key}: {run.phase === "ready" ? "Dry Run Complete" : run.phase === "complete" ? "Processing Complete - Review Results" : run.phase === "cancelled" ? "Stopped" : run.phase === "scan" ? "Dry Run" : "Import"}</strong>
        {report.summary && <span>{report.summary.total} records; {report.summary.issues} with exceptions; {report.summary.warnings} with warnings</span>}
        {(["scan", "import"].includes(run.phase)) && (running ? <button onClick={() => { active.current = false; }} className="rounded border px-3 py-2 text-sm">Pause After Current Batch</button> : <button disabled={busy} onClick={() => process(selected)} className="rounded bg-neutral-900 px-3 py-2 text-sm text-white">Resume Processing</button>)}
        {["scan", "ready", "import"].includes(run.phase) && <button disabled={busy} onClick={stopRun} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Stop Run</button>}
      </div>
      {run.last_error && <p role="alert" className="text-sm text-red-700">Last batch: {run.last_error}</p>}
      {report.summary && <div className="flex flex-wrap gap-4 text-sm">{Object.entries(report.summary.statuses).map(([status, count]) => <span key={status}><strong>{status}:</strong> {count}</span>)}</div>}
      {Object.entries(run.source_audit || {}).filter(([, count]) => count > 0).map(([key, count]) => <p key={key} role="alert" className="text-sm text-red-700">CMS-wide exception: {key.replaceAll("_", " ")} ({count}). District ownership must be resolved before cutover.</p>)}
      {report.summary && <div className="flex flex-wrap gap-4 text-sm">{Object.entries(run.source_counts).map(([kind, count]) => <span key={kind}>{kind}: CMS {count} / scanned {report.summary?.kinds[kind] || 0}{["ready", "complete"].includes(run.phase) && count !== (report.summary?.kinds[kind] || 0) ? " - count mismatch" : ""}</span>)}</div>}
      {["ready", "complete"].includes(run.phase) && <section className="space-y-3 border-y py-4">
        <h2 className="text-lg font-semibold">Tag Collision Resolution</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-0 flex-1 gap-1 text-sm">Legacy CMS Tag<select disabled={busy} value={legacySlug} onChange={event => { setLegacySlug(event.target.value); setCanonicalTag(""); }} className="w-full rounded border p-2"><option value="">Select Legacy Tag</option>{report.legacyTags?.map(tag => <option key={tag.slug} value={tag.slug}>{tag.name} ({tag.slug})</option>)}</select></label>
          <label className="grid min-w-0 flex-1 gap-1 text-sm">Use Existing NRCS Tag<select disabled={busy || !legacySlug} value={canonicalTag} onChange={event => setCanonicalTag(event.target.value)} className="w-full rounded border p-2"><option value="">Select Canonical Tag</option>{currentTags.map(tag => <option key={tag.id} value={tag.id}>{tag.name} ({tag.slug})</option>)}</select></label>
          <button disabled={busy || !legacySlug || !canonicalTag} onClick={() => { setPendingTags(previous => ({ ...previous, [legacySlug]: canonicalTag })); setLegacySlug(""); setCanonicalTag(""); }} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Add Mapping</button>
          <button disabled={busy} onClick={() => reload().catch(exception => setError(String(exception)))} className="rounded border px-3 py-2 text-sm">Refresh Tags</button>
        </div>
        {Object.entries(pendingTags).map(([slug, id]) => <div key={slug} className="flex flex-wrap items-center gap-3 text-sm"><span>{slug} to {currentTags.find(tag => tag.id === id)?.name || id} (Pending)</span><button disabled={busy} onClick={() => setPendingTags(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => key !== slug)))} className="underline">Remove</button></div>)}
        <button disabled={busy || !Object.keys(pendingTags).length} onClick={resolveTag} className="rounded bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50">Save Mappings &amp; Create Refreshed Dry Run</button>
      </section>}
      {run.phase === "ready" && <section className="flex flex-wrap items-end gap-3 border-b pb-5">
        <label className="grid gap-1 text-sm">Mode<select value={mode} onChange={event => setMode(event.target.value)} className="rounded border p-2"><option value="import">Import</option><option value="delta">Delta Sync</option></select></label>
        <label className="grid flex-1 gap-1 text-sm">Type IMPORT THIS DISTRICT<input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" className="rounded border p-2" /></label>
        <button onClick={beginImport} disabled={busy || Object.keys(pendingTags).length > 0 || confirmation !== "IMPORT THIS DISTRICT"} className="rounded bg-red-700 px-4 py-2 text-sm text-white disabled:opacity-50">Authorize Import</button>
      </section>}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Content</th><th className="p-2">Status</th><th className="p-2">Exceptions / Warnings</th></tr></thead><tbody>{report.items?.map(item => <tr key={item.id} className="border-b align-top"><td className="max-w-xs break-words p-2"><strong>{item.normalized.title || item.normalized.name || item.kind}</strong><div className="text-xs text-neutral-500">{item.kind}: {item.source_id}</div>
        {["stories", "events"].includes(item.kind) && item.status !== "removed" && <details className="mt-3"><summary className="cursor-pointer font-medium">Review Copy / Mapping</summary><div className="mt-2 max-h-64 overflow-auto break-words" dangerouslySetInnerHTML={{ __html: item.normalized.body_html || "" }} />
          {item.normalized.image_url && <img src={item.normalized.image_url} alt="Imported event or Story image" className="mt-2 max-h-40 max-w-full object-contain" />}
          {item.normalized.slug && <p className="mt-2 text-xs">Slug: {item.normalized.slug}</p>}
          {run.phase === "ready" && <form className="mt-3 grid gap-2" onSubmit={event => { event.preventDefault(); saveMapping(item, new FormData(event.currentTarget)); }}>
            <label className="grid gap-1">Owner<select name="owner_id" defaultValue={item.normalized.owner_id || ""} className="max-w-full rounded border p-2"><option value="">Unassigned</option>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.email}</option>)}</select></label>
            {item.kind === "events" && <label className="grid gap-1">Classification<select name="classification_target_id" defaultValue={item.normalized.classification_target_id || ""} className="max-w-full rounded border p-2"><option value="">Use Source Classification</option>{terms.filter(term => term.district_key === run.district_key && (!item.normalized.is_school_sports || term.kind === "sport")).map(term => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label>}
            <button disabled={busy} className="justify-self-start rounded border px-3 py-2 disabled:opacity-50">Save Mapping</button>
          </form>}
        </details>}
      </td><td className="p-2">{item.status}</td><td className="max-w-lg break-words p-2">{[item.detail, ...item.errors, ...item.warnings].filter(Boolean).map((message, index) => <p key={index}>{message}</p>)}</td></tr>)}</tbody></table></div>
      <div className="flex items-center gap-3 text-sm"><button disabled={busy || page === 0} onClick={() => setPage(page - 1)} className="rounded border px-3 py-2 disabled:opacity-50">Previous</button><span>Page {page + 1}</span><button disabled={busy || (page + 1) * 50 >= (report.count || 0)} onClick={() => setPage(page + 1)} className="rounded border px-3 py-2 disabled:opacity-50">Next</button></div>
    </>}
  </div>;
}
