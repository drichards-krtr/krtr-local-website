"use client";
import { useState, type FormEvent } from "react";
import { formatDateTimeForInput } from "@/lib/localDates";
import { SaveFeedback, useEditorialSave } from "./NrcsOutputEditor";
import NrcsPublicationDelivery from "./NrcsPublicationDelivery";
import NrcsCloudinaryAssetPicker from "./NrcsCloudinaryAssetPicker";
import { NrcsMuxLibraryPicker, NrcsMuxUploader } from "./NrcsMuxVideoTools";

type Daily = { id: string; district_key: string; edition_id: string; hero_asset_id: string | null; video_asset_id: string | null; status: string; scheduled_at: string; revision: number };
type Asset = { id: string; title: string; asset_type: "image" | "graphic" | "video"; thumbnail_url: string | null };
type Edition = { id: string; title: string; assets: Asset[] };
const input = "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm";
const button = "w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

export default function NrcsDailiesManager({ districtKey, timezone, initialDailies, editions, categories, tags }: { districtKey: string; timezone: string; initialDailies: Daily[]; editions: Edition[]; categories: Array<{ id: string; name: string }>; tags: Array<{ id: string; name: string; tag_type: string }> }) {
  const [dailies, setDailies] = useState(initialDailies);
  const [selected, setSelected] = useState(initialDailies[0]?.id || "");
  const [newKey, setNewKey] = useState(0);
  const daily = dailies.find(item => item.id === selected) || null;
  return <div className="grid gap-5"><div className="flex flex-wrap items-end gap-3"><label className="grid min-w-64 gap-1 text-sm"><span>Daily</span><select className={input} value={selected} onChange={e => setSelected(e.target.value)}><option value="">New Daily</option>{dailies.map(item => <option key={item.id} value={item.id}>{editions.find(e => e.id === item.edition_id)?.title || "Daily"} · {new Date(item.scheduled_at).toLocaleString()} · {item.status}</option>)}</select></label><button type="button" className={button} onClick={() => { setSelected(""); setNewKey(k => k + 1); }}>New Daily</button></div><DailyEditor key={daily?.id || `new-${newKey}`} districtKey={districtKey} timezone={timezone} daily={daily} editions={editions} categories={categories} tags={tags} onSaved={saved => { setDailies(list => [saved, ...list.filter(item => item.id !== saved.id)]); setSelected(saved.id); }} /></div>;
}

function DailyEditor({ districtKey, timezone, daily, editions, categories, tags, onSaved }: { districtKey: string; timezone: string; daily: Daily | null; editions: Edition[]; categories: Array<{ id: string; name: string }>; tags: Array<{ id: string; name: string; tag_type: string }>; onSaved: (daily: Daily) => void }) {
  const [id] = useState(daily?.id || crypto.randomUUID());
  const [editionId, setEditionId] = useState(daily?.edition_id || editions[0]?.id || "");
  const [localEditions, setLocalEditions] = useState(editions);
  const [mediaMessage, setMediaMessage] = useState("");
  const [mediaError, setMediaError] = useState("");
  const state = useEditorialSave();
  const assets = localEditions.find(edition => edition.id === editionId)?.assets || [];
  const heroes = assets.filter(asset => asset.asset_type === "image" || asset.asset_type === "graphic");
  const videos = assets.filter(asset => asset.asset_type === "video");
  function addAsset(asset: Asset) {
    setLocalEditions(list => list.map(edition => edition.id === editionId ? { ...edition, assets: [...edition.assets.filter(item => item.id !== asset.id), asset] } : edition));
    setMediaMessage("Media attached to this Program Edition."); setMediaError(""); state.setDirty(true);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const data = await state.save("daily", { ...Object.fromEntries(form), id, edition_id: editionId, district_key: districtKey, revision: daily?.revision || 0 });
    if (data) onSaved(data.daily);
  }
  return <section className="grid gap-5 border-t border-neutral-300 pt-5"><SaveFeedback state={state} />{daily && <NrcsPublicationDelivery kind="daily" sourceId={daily.id} districtKey={districtKey} revision={daily.revision} disabled={state.dirty || state.busy} />}<form onSubmit={submit} onChange={() => state.setDirty(true)}><fieldset disabled={state.busy} className="grid gap-4 md:grid-cols-2"><label className="grid gap-1 text-sm"><span>Program Edition</span><select required className={input} value={editionId} onChange={e => { setEditionId(e.target.value); setMediaMessage(""); setMediaError(""); }}>{localEditions.map(edition => <option key={edition.id} value={edition.id}>{edition.title}</option>)}</select></label><label className="grid gap-1 text-sm"><span>Hero Graphic</span><select key={`hero-${editionId}`} required name="hero_asset_id" className={input} defaultValue={daily?.edition_id === editionId ? daily.hero_asset_id || "" : ""}><option value="">Select Hero graphic</option>{heroes.map(asset => <option key={asset.id} value={asset.id}>{asset.title}</option>)}</select></label><label className="grid gap-1 text-sm"><span>Video</span><select key={`video-${editionId}`} required name="video_asset_id" className={input} defaultValue={daily?.edition_id === editionId ? daily.video_asset_id || "" : ""}><option value="">Select ready video</option>{videos.map(asset => <option key={asset.id} value={asset.id}>{asset.title}</option>)}</select></label><label className="grid gap-1 text-sm"><span>Publication Date/Time · {timezone}</span><input required type="datetime-local" name="scheduled_at" className={input} defaultValue={formatDateTimeForInput(daily?.scheduled_at, timezone)} /></label><label className="grid gap-1 text-sm"><span>Status</span><select name="status" className={input} defaultValue={daily?.status || "draft"}><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="published">Published</option><option value="archived">Archived</option></select></label><button className={button}>Save Daily</button></fieldset></form><div className="grid gap-4 border-t border-neutral-200 pt-5"><h3 className="font-semibold">Edition Media</h3><p className="text-sm text-neutral-600">Both required selections must be attached to the selected Program Edition. New Mux uploads become selectable after processing is complete.</p><NrcsCloudinaryAssetPicker clientSubmit editionId={editionId} districtKey={districtKey} label="Choose Hero in Cloudinary" submitLabel="Attach Hero to Edition" action={async form => { const data = await state.save("image", { ...Object.fromEntries(form), edition_id: editionId, district_key: districtKey, revision: 0 }); if (data?.asset) addAsset({ ...data.asset, thumbnail_url: data.asset.cloudinary_url || null }); }} /><NrcsMuxUploader editionId={editionId} districtKey={districtKey} categories={categories} tags={tags} /><NrcsMuxLibraryPicker editionId={editionId} districtKey={districtKey} categories={categories} tags={tags} />{mediaMessage && <p role="status" className="text-sm text-green-800">{mediaMessage}</p>}{mediaError && <p role="alert" className="text-sm text-red-700">{mediaError}</p>}</div><p className="text-sm text-neutral-600">Homepage eligibility begins at the scheduled time and ends at 11:59:59 PM in {timezone}.</p></section>;
}
