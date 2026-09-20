"use client";
import { useState, type FormEvent } from "react";
import { formatDateTimeForInput } from "@/lib/localDates";
import { SaveFeedback, useEditorialSave } from "./NrcsOutputEditor";
import NrcsPublicationDelivery from "./NrcsPublicationDelivery";

type Daily = { id: string; district_key: string; edition_id: string; asset_id: string; status: string; scheduled_at: string; revision: number };
type Edition = { id: string; title: string; assets: Array<{ id: string; title: string }> };
const input = "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm";
const button = "w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

export default function NrcsDailiesManager({ districtKey, timezone, initialDailies, editions }: { districtKey: string; timezone: string; initialDailies: Daily[]; editions: Edition[] }) {
  const [dailies, setDailies] = useState(initialDailies);
  const [selected, setSelected] = useState(initialDailies[0]?.id || "");
  const [newKey, setNewKey] = useState(0);
  const daily = dailies.find(item => item.id === selected) || null;
  return <div className="grid gap-5"><div className="flex flex-wrap items-end gap-3"><label className="grid min-w-64 gap-1 text-sm"><span>Daily</span><select className={input} value={selected} onChange={e => setSelected(e.target.value)}><option value="">New Daily</option>{dailies.map(item => <option key={item.id} value={item.id}>{editions.find(e => e.id === item.edition_id)?.title || "Daily"} · {new Date(item.scheduled_at).toLocaleString()} · {item.status}</option>)}</select></label><button type="button" className={button} onClick={() => { setSelected(""); setNewKey(k => k + 1); }}>New Daily</button></div><DailyEditor key={daily?.id || `new-${newKey}`} districtKey={districtKey} timezone={timezone} daily={daily} editions={editions} onSaved={saved => { setDailies(list => [saved, ...list.filter(item => item.id !== saved.id)]); setSelected(saved.id); }} /></div>;
}

function DailyEditor({ districtKey, timezone, daily, editions, onSaved }: { districtKey: string; timezone: string; daily: Daily | null; editions: Edition[]; onSaved: (daily: Daily) => void }) {
  const [id] = useState(daily?.id || crypto.randomUUID());
  const [editionId, setEditionId] = useState(daily?.edition_id || editions[0]?.id || "");
  const state = useEditorialSave();
  const assets = editions.find(edition => edition.id === editionId)?.assets || [];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const data = await state.save("daily", { ...Object.fromEntries(form), id, edition_id: editionId, district_key: districtKey, revision: daily?.revision || 0 });
    if (data) onSaved(data.daily);
  }
  return <section className="grid gap-4 border-t border-neutral-300 pt-5"><SaveFeedback state={state} />{daily && <NrcsPublicationDelivery kind="daily" sourceId={daily.id} districtKey={districtKey} revision={daily.revision} disabled={state.dirty || state.busy} />}<form onSubmit={submit} onChange={() => state.setDirty(true)}><fieldset disabled={state.busy} className="grid gap-4 md:grid-cols-2"><label className="grid gap-1 text-sm"><span>Program Edition</span><select required className={input} value={editionId} onChange={e => setEditionId(e.target.value)}>{editions.map(edition => <option key={edition.id} value={edition.id}>{edition.title}</option>)}</select></label><label className="grid gap-1 text-sm"><span>Finished Media</span><select key={editionId} required name="asset_id" className={input} defaultValue={daily?.edition_id === editionId ? daily.asset_id : ""}><option value="">Select media</option>{assets.map(asset => <option key={asset.id} value={asset.id}>{asset.title}</option>)}</select></label><label className="grid gap-1 text-sm"><span>Publication Date/Time · {timezone}</span><input required type="datetime-local" name="scheduled_at" className={input} defaultValue={formatDateTimeForInput(daily?.scheduled_at, timezone)} /></label><label className="grid gap-1 text-sm"><span>Status</span><select name="status" className={input} defaultValue={daily?.status || "draft"}><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="published">Published</option><option value="archived">Archived</option></select></label><button className={button}>Save Daily</button></fieldset></form><p className="text-sm text-neutral-600">Homepage eligibility begins at the scheduled time and ends at 11:59:59 PM in {timezone}.</p></section>;
}
