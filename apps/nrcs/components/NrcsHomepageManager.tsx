"use client";

import { useEffect, useState, type FormEvent } from "react";
import { formatDateTimeForInput } from "@/lib/localDates";
import { alertIsActive } from "@/lib/outputs";
import NrcsEditorialPicker from "./NrcsEditorialPicker";
import { SaveFeedback, useEditorialSave } from "./NrcsOutputEditor";
import NrcsPublicationDelivery from "./NrcsPublicationDelivery";

export type HomepageLineup = { district_key: string; revision: number; hero_output_id: string | null; top_output_ids: string[] };
export type PriorityAlert = { id: string; district_key: string; revision: number; headline: string; message: string; active: boolean; start_at: string | null; end_at: string | null; target_type: string; target_id: string | null; external_url: string | null; archived_at: string | null; has_delivery?: boolean };
type Target = { type: string; id: string } | null;
const input = "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm";
const button = "w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
function AlertEditor({ districtKey, timezone, alert, seed, target, onSaved, onArchived, onDeleted, onDuplicate }: { districtKey: string; timezone: string; alert: PriorityAlert | null; seed: PriorityAlert | null; target: Target; onSaved: (a: PriorityAlert) => void; onArchived: (a: PriorityAlert) => void; onDeleted: (id: string) => void; onDuplicate: (a: PriorityAlert) => void }) {
  const initial = alert || seed;
  const [id] = useState(() => alert?.id || crypto.randomUUID());
  const [type, setType] = useState(initial?.target_type || target?.type || "none");
  const [targetId, setTargetId] = useState(initial?.target_id || target?.id || "");
  const state = useEditorialSave();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const data = await state.save("alert", { ...Object.fromEntries(form), id, revision: alert?.revision || 0, district_key: districtKey, active: form.get("active") === "on", target_type: type, target_id: targetId });
    if (data) onSaved(data.alert);
  }
  async function archive() { if (!alert || !window.confirm("Archive this Alert? It will be disabled and removed from the default working view.")) return; const data = await state.save("alert", { id: alert.id, district_key: districtKey, revision: alert.revision, operation: "archive" }); if (data?.alert) onArchived(data.alert); }
  async function remove() { if (!alert || !window.confirm("Permanently delete this never-delivered Alert draft? This cannot be undone.")) return; const data = await state.save("alert", { id: alert.id, district_key: districtKey, revision: alert.revision, operation: "delete" }); if (data?.deleted) onDeleted(data.deleted); }
  const archived = Boolean(alert?.archived_at);
  return <div className="grid gap-3"><SaveFeedback state={state} /><form onSubmit={submit} onChange={() => state.setDirty(true)}><fieldset disabled={state.busy || archived} className="grid gap-4 md:grid-cols-2">
    <label className="grid gap-1 text-sm md:col-span-2"><span>Headline</span><input name="headline" required maxLength={240} className={input} defaultValue={initial?.headline || ""} /></label><label className="grid gap-1 text-sm md:col-span-2"><span>Message</span><textarea name="message" maxLength={4000} className={input} rows={3} defaultValue={initial?.message || ""} /></label>
    <label className="grid gap-1 text-sm"><span>Starts · {timezone} · Optional</span><input type="datetime-local" name="start_at" className={input} defaultValue={formatDateTimeForInput(initial?.start_at, timezone)} /></label><label className="grid gap-1 text-sm"><span>Ends · {timezone} · Optional</span><input type="datetime-local" name="end_at" className={input} defaultValue={formatDateTimeForInput(initial?.end_at, timezone)} /></label>
    <label className="grid gap-1 text-sm"><span>Link Target</span><select className={input} value={type} onChange={e => { setType(e.target.value); setTargetId(""); state.setDirty(true); }}><option value="none">No link</option><option value="story">Story</option><option value="event">Event</option><option value="external">External URL</option></select></label>
    {type === "external" && <label className="grid gap-1 text-sm"><span>External URL</span><input type="url" name="external_url" required className={input} defaultValue={initial?.external_url || ""} /></label>}
    {(type === "story" || type === "event") && <NrcsEditorialPicker label={type === "story" ? "Published Story" : "Published Event"} type={type} districtKey={districtKey} value={targetId} onChange={v => { setTargetId(v); state.setDirty(true); }} />}
    <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" name="active" defaultChecked={seed ? false : alert?.active || false} />Enabled</label>{!archived && <button className={button}>Save Priority Alert</button>}
  </fieldset></form>{alert && <div className="flex flex-wrap gap-3">{!archived && <button type="button" className="rounded border border-neutral-400 bg-white px-4 py-2 text-sm font-semibold" disabled={state.busy} onClick={() => void archive()}>Archive Alert</button>}{archived && <button type="button" className={button} onClick={() => onDuplicate(alert)}>Duplicate as Draft</button>}{archived && !alert.has_delivery && <button type="button" className="rounded border border-red-700 bg-white px-4 py-2 text-sm font-semibold text-red-800" disabled={state.busy} onClick={() => void remove()}>Delete Draft Permanently</button>}</div>}{alert && <NrcsPublicationDelivery kind="alert" sourceId={alert.id} districtKey={districtKey} revision={alert.revision} disabled={state.dirty || state.busy} />}</div>;
}
export default function NrcsHomepageManager({ districtKey, timezone, initialLineup, initialAlerts, initialTarget }: { districtKey: string; timezone: string; initialLineup: HomepageLineup | null; initialAlerts: PriorityAlert[]; initialTarget: Target }) {
  const [lineup, setLineup] = useState(initialLineup);
  const [hero, setHero] = useState(initialLineup?.hero_output_id || "");
  const [top, setTop] = useState(initialLineup?.top_output_ids || []);
  const [alerts, setAlerts] = useState(initialAlerts);
  const [view, setView] = useState<"working" | "archived">("working");
  const workingAlerts = alerts.filter(alert => !alert.archived_at);
  const archivedAlerts = alerts.filter(alert => alert.archived_at);
  const [selected, setSelected] = useState<string | null>(initialTarget ? null : workingAlerts[0]?.id || null);
  const [draftSeed, setDraftSeed] = useState<PriorityAlert | null>(null);
  const [newKey, setNewKey] = useState(0);
  const [alertNotice, setAlertNotice] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  const state = useEditorialSave();
  useEffect(() => { setNow(new Date()); const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);
  const active = now ? workingAlerts.find(a => alertIsActive(a, now)) : null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = await state.save("homepage", { district_key: districtKey, revision: lineup?.revision || 0, hero_output_id: hero, top_output_ids: top.filter(Boolean), daily_edition_id: null, daily_asset_id: null, daily_publication_date: null });
    if (data) setLineup(data.lineup);
  }
  function change(fn: () => void) { fn(); state.setDirty(true); }
  function move(index: number, direction: number) { const next = [...top]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; change(() => setTop(next)); }
  return <div className="grid gap-8"><section className="grid gap-4 border-t border-neutral-300 pt-5"><h2 className="text-lg font-semibold">Homepage Lineup</h2><SaveFeedback state={state} />{lineup && <NrcsPublicationDelivery kind="homepage" sourceId={districtKey} districtKey={districtKey} revision={lineup.revision} disabled={state.dirty || state.busy} />}<form onSubmit={submit}><fieldset disabled={state.busy} className="grid gap-5 md:grid-cols-2">
    <NrcsEditorialPicker label="Hero Story" type="output" districtKey={districtKey} value={hero} onChange={id => change(() => setHero(id))} />
    <div className="grid gap-3"><h3 className="text-sm font-semibold">Top Four</h3>{top.map((id, index) => <div key={index} className="flex min-w-0 items-end gap-2"><div className="min-w-0 flex-1"><NrcsEditorialPicker label={`Position ${index + 1}`} type="output" districtKey={districtKey} value={id} onChange={value => change(() => setTop(list => list.map((item, i) => i === index ? value : item)))} /></div><button type="button" title="Move up" aria-label="Move Top Four item up" disabled={index === 0} className="h-9 w-9 border disabled:opacity-30" onClick={() => move(index, -1)}>↑</button><button type="button" title="Move down" aria-label="Move Top Four item down" disabled={index === top.length - 1} className="h-9 w-9 border disabled:opacity-30" onClick={() => move(index, 1)}>↓</button><button type="button" title="Remove position" aria-label="Remove Top Four position" className="h-9 w-9 border" onClick={() => change(() => setTop(list => list.filter((_, i) => i !== index)))}>×</button></div>)}{top.length < 4 && <button type="button" className="w-fit text-sm underline" onClick={() => change(() => setTop(list => [...list, ""]))}>Add Position</button>}</div>
    <button className={`${button} self-end`}>Save Homepage Lineup</button>
  </fieldset></form></section>
    <section className="grid gap-4 border-t border-neutral-300 pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Priority Alerts</h2><button type="button" className={button} onClick={() => { if (window.confirm("Open a new alert? Unsaved alert changes will be discarded.")) { setView("working"); setSelected(null); setDraftSeed(null); setNewKey(k => k + 1); setAlertNotice(""); } }}>New Priority Alert</button></div>
      {active && <div className="border-l-4 border-yellow-500 bg-yellow-100 p-4 text-black"><h3 className="text-xl font-semibold break-words">{active.headline}</h3><p className="mt-2 whitespace-pre-wrap break-words">{active.message}</p></div>}
      {alertNotice && <p role="status" className="border-l-4 border-green-600 bg-green-50 p-3 text-sm">{alertNotice}</p>}
      <div className="flex gap-2"><button type="button" className={view === "working" ? button : "rounded border bg-white px-4 py-2 text-sm font-semibold"} onClick={() => { setView("working"); setSelected(workingAlerts[0]?.id || null); setDraftSeed(null); }}>Working ({workingAlerts.length})</button><button type="button" className={view === "archived" ? button : "rounded border bg-white px-4 py-2 text-sm font-semibold"} onClick={() => { setView("archived"); setSelected(archivedAlerts[0]?.id || null); setDraftSeed(null); }}>Archived ({archivedAlerts.length})</button></div>
      <select aria-label="Select Priority Alert" value={selected || ""} className={input} onChange={e => { if (window.confirm("Switch alerts? Unsaved changes will be discarded.")) { setSelected(e.target.value || null); setDraftSeed(null); setAlertNotice(""); } }}><option value="">{view === "working" ? "New alert" : "Select archived Alert"}</option>{(view === "working" ? workingAlerts : archivedAlerts).map(a => <option key={a.id} value={a.id}>{a.headline} · {view === "archived" ? "Archived" : now && alertIsActive(a, now) ? "Active now" : a.active ? "Enabled" : "Disabled"}</option>)}</select>
      {(view === "working" || selected) && <AlertEditor key={selected || `new-${newKey}`} districtKey={districtKey} timezone={timezone} alert={alerts.find(a => a.id === selected) || null} seed={draftSeed} target={initialTarget} onSaved={a => { setAlerts(list => [a, ...list.filter(item => item.id !== a.id)]); setDraftSeed(null); setSelected(a.id); setAlertNotice("Priority Alert saved and queued for CMS delivery."); }} onArchived={a => { setAlerts(list => [a, ...list.filter(item => item.id !== a.id)]); const remaining = workingAlerts.filter(item => item.id !== a.id); setSelected(remaining[0]?.id || null); setAlertNotice("Alert archived and disabled in CMS."); }} onDeleted={id => { setAlerts(list => list.filter(item => item.id !== id)); setSelected(null); setAlertNotice("Undelivered Alert draft permanently deleted."); }} onDuplicate={source => { setView("working"); setSelected(null); setDraftSeed({ ...source, id: "", revision: 0, active: false, archived_at: null, has_delivery: false }); setNewKey(key => key + 1); setAlertNotice("Draft copy opened. Review dates and save when ready."); }} />}
    </section>
  </div>;
}
