"use client";

import { useEffect, useState, type FormEvent } from "react";
import { formatDateTimeForInput, getDateTextInTimeZone } from "@/lib/localDates";
import { alertIsActive, dailyIsEligible } from "@/lib/outputs";
import NrcsEditorialPicker from "./NrcsEditorialPicker";
import { SaveFeedback, useEditorialSave } from "./NrcsOutputEditor";
import NrcsCloudinaryAssetPicker from "./NrcsCloudinaryAssetPicker";

export type HomepageLineup = { district_key: string; revision: number; hero_output_id: string | null; top_output_ids: string[]; daily_edition_id: string | null; daily_asset_id: string | null; daily_publication_date: string | null };
export type PriorityAlert = { id: string; district_key: string; revision: number; headline: string; message: string; active: boolean; start_at: string | null; end_at: string | null; target_type: string; target_id: string | null; external_url: string | null };
type Target = { type: string; id: string } | null;
const input = "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm";
const button = "w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
function AlertEditor({ districtKey, timezone, alert, target, onSaved }: { districtKey: string; timezone: string; alert: PriorityAlert | null; target: Target; onSaved: (a: PriorityAlert) => void }) {
  const [id] = useState(() => alert?.id || crypto.randomUUID());
  const [type, setType] = useState(alert?.target_type || target?.type || "none");
  const [targetId, setTargetId] = useState(alert?.target_id || target?.id || "");
  const state = useEditorialSave();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const data = await state.save("alert", { ...Object.fromEntries(form), id, revision: alert?.revision || 0, district_key: districtKey, active: form.get("active") === "on", target_type: type, target_id: targetId });
    if (data) onSaved(data.alert);
  }
  return <div className="grid gap-3"><SaveFeedback state={state} /><form onSubmit={submit} onChange={() => state.setDirty(true)}><fieldset disabled={state.busy} className="grid gap-4 md:grid-cols-2">
    <label className="grid gap-1 text-sm md:col-span-2"><span>Headline</span><input name="headline" required maxLength={240} className={input} defaultValue={alert?.headline || ""} /></label><label className="grid gap-1 text-sm md:col-span-2"><span>Message</span><textarea name="message" maxLength={4000} className={input} rows={3} defaultValue={alert?.message || ""} /></label>
    <label className="grid gap-1 text-sm"><span>Starts · {timezone} · Optional</span><input type="datetime-local" name="start_at" className={input} defaultValue={formatDateTimeForInput(alert?.start_at, timezone)} /></label><label className="grid gap-1 text-sm"><span>Ends · {timezone} · Optional</span><input type="datetime-local" name="end_at" className={input} defaultValue={formatDateTimeForInput(alert?.end_at, timezone)} /></label>
    <label className="grid gap-1 text-sm"><span>Link Target</span><select className={input} value={type} onChange={e => { setType(e.target.value); setTargetId(""); state.setDirty(true); }}><option value="none">No link</option><option value="story">Story</option><option value="event">Event</option><option value="external">External URL</option></select></label>
    {type === "external" && <label className="grid gap-1 text-sm"><span>External URL</span><input type="url" name="external_url" required className={input} defaultValue={alert?.external_url || ""} /></label>}
    {(type === "story" || type === "event") && <NrcsEditorialPicker label={type === "story" ? "Published Story" : "Published Event"} type={type} districtKey={districtKey} value={targetId} onChange={v => { setTargetId(v); state.setDirty(true); }} />}
    <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" name="active" defaultChecked={alert?.active || false} />Enabled</label><button className={button}>Save Priority Alert</button>
  </fieldset></form></div>;
}
export default function NrcsHomepageManager({ districtKey, timezone, initialLineup, initialAlerts, initialTarget }: { districtKey: string; timezone: string; initialLineup: HomepageLineup | null; initialAlerts: PriorityAlert[]; initialTarget: Target }) {
  const [lineup, setLineup] = useState(initialLineup);
  const [hero, setHero] = useState(initialLineup?.hero_output_id || "");
  const [top, setTop] = useState(initialLineup?.top_output_ids || []);
  const [edition, setEdition] = useState(initialLineup?.daily_edition_id || "");
  const [asset, setAsset] = useState(initialLineup?.daily_asset_id || "");
  const [libraryAsset, setLibraryAsset] = useState("");
  const [mediaRefresh, setMediaRefresh] = useState(0);
  const mediaState = useEditorialSave();
  const imageState = useEditorialSave();
  const [date, setDate] = useState(initialLineup?.daily_publication_date || getDateTextInTimeZone(new Date(), timezone));
  const [alerts, setAlerts] = useState(initialAlerts);
  const [selected, setSelected] = useState<string | null>(initialTarget ? null : initialAlerts[0]?.id || null);
  const [newKey, setNewKey] = useState(0);
  const [alertNotice, setAlertNotice] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  const state = useEditorialSave();
  useEffect(() => { setNow(new Date()); const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);
  const active = now ? alerts.find(a => alertIsActive(a, now)) : null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = await state.save("homepage", { district_key: districtKey, revision: lineup?.revision || 0, hero_output_id: hero, top_output_ids: top.filter(Boolean), daily_edition_id: edition, daily_asset_id: asset, daily_publication_date: date });
    if (data) setLineup(data.lineup);
  }
  function change(fn: () => void) { fn(); state.setDirty(true); }
  function move(index: number, direction: number) { const next = [...top]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; change(() => setTop(next)); }
  return <div className="grid gap-8"><section className="grid gap-4 border-t border-neutral-300 pt-5"><h2 className="text-lg font-semibold">Homepage Lineup</h2><SaveFeedback state={state} /><form onSubmit={submit}><fieldset disabled={state.busy || mediaState.busy || imageState.busy} className="grid gap-5 md:grid-cols-2">
    <NrcsEditorialPicker label="Hero Story" type="output" districtKey={districtKey} value={hero} onChange={id => change(() => setHero(id))} />
    <div className="grid gap-3"><h3 className="text-sm font-semibold">Top Four</h3>{top.map((id, index) => <div key={index} className="flex min-w-0 items-end gap-2"><div className="min-w-0 flex-1"><NrcsEditorialPicker label={`Position ${index + 1}`} type="output" districtKey={districtKey} value={id} onChange={value => change(() => setTop(list => list.map((item, i) => i === index ? value : item)))} /></div><button type="button" title="Move up" aria-label="Move Top Four item up" disabled={index === 0} className="h-9 w-9 border disabled:opacity-30" onClick={() => move(index, -1)}>↑</button><button type="button" title="Move down" aria-label="Move Top Four item down" disabled={index === top.length - 1} className="h-9 w-9 border disabled:opacity-30" onClick={() => move(index, 1)}>↓</button><button type="button" title="Remove position" aria-label="Remove Top Four position" className="h-9 w-9 border" onClick={() => change(() => setTop(list => list.filter((_, i) => i !== index)))}>×</button></div>)}{top.length < 4 && <button type="button" className="w-fit text-sm underline" onClick={() => change(() => setTop(list => [...list, ""]))}>Add Position</button>}</div>
    <NrcsEditorialPicker label="Daily Edition" type="edition" districtKey={districtKey} value={edition} onChange={id => change(() => { setEdition(id); setAsset(""); })} />
    <NrcsEditorialPicker label="Daily Finished Media" type="asset" districtKey={districtKey} editionId={edition} value={asset} refreshKey={mediaRefresh} onChange={id => change(() => setAsset(id))} />
    {edition && <div className="grid gap-3 md:col-span-2"><h3 className="text-sm font-semibold">Attach Existing Media to Daily Edition</h3><NrcsEditorialPicker label="Shared Images / District Videos" type="library" districtKey={districtKey} value={libraryAsset} onChange={setLibraryAsset} /><button type="button" disabled={!libraryAsset || mediaState.busy} className={button} onClick={async () => { const data = await mediaState.save("edition-media", { district_key: districtKey, revision: 0, edition_id: edition, asset_id: libraryAsset }); if (data) { change(() => setAsset(libraryAsset)); setMediaRefresh(k => k + 1); } }}>Attach Media</button><SaveFeedback state={mediaState} /></div>}
    <label className="grid gap-1 text-sm"><span>Daily Publication Date · {timezone}</span><input type="date" disabled={!edition} required={Boolean(edition)} value={date} onChange={e => change(() => setDate(e.target.value))} className={input} /></label><button className={`${button} self-end`}>Save Homepage Lineup</button>
  </fieldset></form>{edition && <div className="grid gap-3"><h3 className="text-sm font-semibold">Daily Edition Images</h3><fieldset disabled={imageState.busy || mediaState.busy || state.busy}><NrcsCloudinaryAssetPicker clientSubmit storyId="" districtKey={districtKey} action={async form => { const data = await imageState.save("image", { ...Object.fromEntries(form), edition_id: edition, revision: 0 }); if (data) { change(() => setAsset(data.asset.id)); setMediaRefresh(k => k + 1); } }} /></fieldset><SaveFeedback state={imageState} /></div>}{lineup && <p className="text-sm text-neutral-600">CMS delivery: Not enabled · Saved Daily: {lineup.daily_publication_date || "None"}{lineup.daily_publication_date && now ? dailyIsEligible(lineup.daily_publication_date, timezone, now) ? " · Eligible today" : " · Not eligible today" : ""}</p>}</section>
    <section className="grid gap-4 border-t border-neutral-300 pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Priority Alerts</h2><button type="button" className={button} onClick={() => { if (window.confirm("Open a new alert? Unsaved alert changes will be discarded.")) { setSelected(null); setNewKey(k => k + 1); setAlertNotice(""); } }}>New Priority Alert</button></div>
      {active && <div className="border-l-4 border-yellow-500 bg-yellow-100 p-4 text-black"><h3 className="text-xl font-semibold break-words">{active.headline}</h3><p className="mt-2 whitespace-pre-wrap break-words">{active.message}</p></div>}
      {alertNotice && <p role="status" className="border-l-4 border-green-600 bg-green-50 p-3 text-sm">{alertNotice}</p>}
      <select aria-label="Select Priority Alert" value={selected || ""} className={input} onChange={e => { if (window.confirm("Switch alerts? Unsaved changes will be discarded.")) { setSelected(e.target.value || null); setAlertNotice(""); } }}><option value="">New alert</option>{alerts.map(a => <option key={a.id} value={a.id}>{a.headline} · {now && alertIsActive(a, now) ? "Active now" : a.active ? "Enabled" : "Disabled"}</option>)}</select>
      <AlertEditor key={selected || `new-${newKey}`} districtKey={districtKey} timezone={timezone} alert={alerts.find(a => a.id === selected) || null} target={initialTarget} onSaved={a => { setAlerts(list => [a, ...list.filter(item => item.id !== a.id)]); setSelected(a.id); setAlertNotice("Priority Alert instructions saved in NRCS. Not sent to CMS."); }} />
    </section>
  </div>;
}
