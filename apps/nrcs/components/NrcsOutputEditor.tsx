"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatDateTimeForInput } from "@/lib/localDates";
import { isReadyPublicAsset, orderedArticleMedia, SOCIAL_DESTINATIONS, type OutputAsset, type OutputVersion, type SocialOutput, type WebOutput } from "@/lib/outputs";
import NrcsCloudinaryAssetPicker from "./NrcsCloudinaryAssetPicker";

const input = "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm";
const button = "w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
function socialPlainText(html: string) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed.querySelectorAll("p,h1,h2,li,blockquote,br").forEach(block => block.after(parsed.createTextNode("\n")));
  return (parsed.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}
export function useEditorialSave() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => { if (dirty || lock.current) { event.preventDefault(); event.returnValue = ""; } };
    const protectLink = (event: MouseEvent) => {
      const target = (event.target as Element)?.closest?.("a[href]");
      if ((dirty || lock.current) && target && !window.confirm("Leave without saving your changes?")) event.preventDefault();
    };
    window.addEventListener("beforeunload", protect);
    document.addEventListener("click", protectLink, true);
    return () => { window.removeEventListener("beforeunload", protect); document.removeEventListener("click", protectLink, true); };
  }, [dirty]);
  async function save(kind: string, body: unknown) {
    if (lock.current) return null;
    lock.current = true; setBusy(true); setNotice(""); setError("");
    try {
      const response = await fetch(`/api/editorial/${kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Save failed.");
      setNotice(data.message); setDirty(false); return data;
    } catch (failure) {
      setError(failure instanceof Error && failure.name === "TimeoutError" ? "Confirmation timed out. Reload to check whether the save completed before retrying." : failure instanceof Error ? failure.message : "Save failed.");
      return null;
    } finally { lock.current = false; setBusy(false); }
  }
  return { busy, notice, error, dirty, setDirty, save };
}
export function SaveFeedback({ state }: { state: ReturnType<typeof useEditorialSave> }) {
  return <div aria-live="polite">{state.busy && <p role="status" className="text-sm">Saving…</p>}{state.notice && <p role="status" className="border-l-4 border-green-600 bg-green-50 p-3 text-sm text-green-900">{state.notice}</p>}{state.error && <p role="alert" className="border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-900">{state.error}</p>}</div>;
}
export function MediaOrder({ assets, selected, onChange, heroId }: { assets: OutputAsset[]; selected: string[]; onChange: (ids: string[]) => void; heroId?: string | null }) {
  function move(index: number, direction: number) {
    const next = [...selected];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    onChange(orderedArticleMedia(next, heroId || null));
  }
  return <div className="grid gap-3"><div className="grid gap-2 sm:grid-cols-2">
    {assets.map(asset => <label key={asset.id} className="flex min-w-0 items-center gap-2 border-b border-neutral-200 py-2 text-sm">
      <input type="checkbox" checked={selected.includes(asset.id)} disabled={!isReadyPublicAsset(asset)} onChange={e => onChange(orderedArticleMedia(e.target.checked ? [...selected, asset.id] : selected.filter(id => id !== asset.id), heroId || null))} />
      {(asset.cloudinary_url || asset.thumbnail_url) && <img alt="" src={asset.cloudinary_url || asset.thumbnail_url || ""} className="h-12 w-16 shrink-0 object-contain" />}
      <span className="min-w-0 break-words">{asset.title}{!isReadyPublicAsset(asset) && " · Not ready"}</span></label>)}
  </div>{selected.length > 0 && <ol className="divide-y border-y border-neutral-200">{selected.map((id, index) => <li key={id} className="flex items-center gap-3 py-2 text-sm"><span className="min-w-0 flex-1 break-words">{index + 1}. {assets.find(a => a.id === id)?.title || "Unavailable asset"}{id === heroId && " · Hero"}</span><button type="button" aria-label="Move media up" title="Move media up" disabled={index === 0 || id === heroId || selected[index - 1] === heroId} className="h-8 w-8 border disabled:opacity-30" onClick={() => move(index, -1)}>↑</button><button type="button" aria-label="Move media down" title="Move media down" disabled={index === selected.length - 1 || id === heroId} className="h-8 w-8 border disabled:opacity-30" onClick={() => move(index, 1)}>↓</button></li>)}</ol>}</div>;
}
function VersionSelect({ versions, value }: { versions: OutputVersion[]; value: string | null }) {
  return <label className="grid gap-1 text-sm"><span>Exact Copy Version</span><select className={input} name="copy_version_id" defaultValue={value ?? versions[0]?.id ?? ""}><option value="">None selected</option>{versions.map((v, i) => <option key={v.id} value={v.id}>v{v.version_number}{i === 0 ? " · Latest" : ""}{v.headline ? ` · ${v.headline}` : ""}</option>)}</select></label>;
}
function DateFields({ output, timezone }: { output: { scheduled_at: string | null; published_at: string | null } | null; timezone: string }) {
  return <><label className="grid gap-1 text-sm"><span>Scheduled At · {timezone}</span><input type="datetime-local" className={input} name="scheduled_at" defaultValue={formatDateTimeForInput(output?.scheduled_at, timezone)} /></label><label className="grid gap-1 text-sm"><span>Published At · {timezone}</span><input type="datetime-local" className={input} name="published_at" defaultValue={formatDateTimeForInput(output?.published_at, timezone)} /></label></>;
}
function WebEditor({ storyId, districtKey, timezone, editor, initialWeb, versions, assets, initialMedia }: { storyId: string; districtKey: string; timezone: string; editor: boolean; initialWeb: WebOutput | null; versions: OutputVersion[]; assets: OutputAsset[]; initialMedia: string[] }) {
  const [output, setOutput] = useState(initialWeb);
  const [hero, setHero] = useState(initialWeb?.hero_asset_id || "");
  const [media, setMedia] = useState(initialMedia);
  const [preview, setPreview] = useState<OutputVersion | null>(null);
  const [slide, setSlide] = useState(0);
  const state = useEditorialSave();
  const formRef = useRef<HTMLFormElement>(null);
  const images = assets.filter(a => ["image", "graphic"].includes(a.asset_type));
  const readonly = !editor && output !== null && output.status !== "draft";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const data = await state.save("web", { ...Object.fromEntries(form), story_id: storyId, district_key: districtKey, revision: output?.revision || 0, hero_asset_id: hero, media_ids: media });
    if (data) { setOutput(data.output); setMedia(orderedArticleMedia(media, hero)); }
  }
  useEffect(() => {
    if (!preview) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Web Output preview"]');
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
      if (e.key === "Tab") {
        const controls = dialog?.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex="0"]');
        const first = controls?.[0], last = controls?.[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", close); return () => { window.removeEventListener("keydown", close); document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, [preview]);
  return <section className="grid gap-4 border-t border-neutral-300 pt-5"><h2 className="text-lg font-semibold">Web Output</h2><SaveFeedback state={state} />
    <form ref={formRef} onSubmit={submit} onChange={() => state.setDirty(true)} className="grid gap-4"><fieldset disabled={state.busy || readonly} className="grid gap-4 md:grid-cols-2">
      <VersionSelect versions={versions} value={output ? output.copy_version_id || "" : versions[0]?.id || ""} />
      <label className="grid gap-1 text-sm"><span>Publication Instruction</span><select name="status" className={input} defaultValue={output?.status || "draft"}><option value="draft">Draft</option>{editor && <><option value="scheduled">Scheduled</option><option value="published">Published</option><option value="unpublished">Unpublished</option></>}{readonly && <option value={output?.status}>{output?.status}</option>}</select></label>
      <label className="grid gap-1 text-sm"><span>Slug</span><input name="slug" className={input} maxLength={240} defaultValue={output?.slug || ""} /></label>
      <label className="grid gap-1 text-sm"><span>Hero Image · Optional</span><select className={input} value={hero} onChange={e => { setHero(e.target.value); setMedia(orderedArticleMedia(media, e.target.value)); state.setDirty(true); }}><option value="">No Hero image</option>{images.filter(isReadyPublicAsset).map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label>
      <DateFields output={output} timezone={timezone} />
      <label className="grid gap-1 text-sm"><span>SEO Title</span><input name="seo_title" maxLength={240} className={input} defaultValue={output?.seo_title || ""} /></label><label className="grid gap-1 text-sm"><span>SEO Description</span><textarea name="seo_description" maxLength={1000} className={input} defaultValue={output?.seo_description || ""} /></label>
      <div className="md:col-span-2"><h3 className="mb-2 text-sm font-semibold">Article Media</h3><MediaOrder assets={images} selected={media} heroId={hero} onChange={ids => { setMedia(ids); state.setDirty(true); }} /></div>
      <button className={button}>Save Web Output</button>
    </fieldset><button type="button" className="w-fit text-sm underline" onClick={() => { const selected = String(new FormData(formRef.current!).get("copy_version_id")); setSlide(0); setPreview(versions.find(v => v.id === selected) || null); }}>Preview Selected Copy</button></form>
    {output && <p className="text-sm text-neutral-600">CMS delivery: Not enabled · Saved instruction: {output.status}</p>}
    {preview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) setPreview(null); }}><div role="dialog" aria-modal="true" aria-label="Web Output preview" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded bg-white p-5"><div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-semibold">Web Copy v{preview.version_number}</h3><button autoFocus type="button" className={button} onClick={() => setPreview(null)}>Close</button></div>{media.length > 0 && <div className="mb-5"><img className="aspect-video w-full object-contain" alt={assets.find(a => a.id === media[slide])?.title || "Article image"} src={assets.find(a => a.id === media[slide])?.cloudinary_url || ""} />{media.length > 1 && <div className="mt-2 flex items-center justify-center gap-4"><button title="Previous image" aria-label="Previous image" className="h-9 w-9 border" onClick={() => setSlide((slide + media.length - 1) % media.length)}>←</button><span>{slide + 1} / {media.length}</span><button title="Next image" aria-label="Next image" className="h-9 w-9 border" onClick={() => setSlide((slide + 1) % media.length)}>→</button></div>}</div>}<h1 className="mb-4 text-2xl font-semibold">{preview.headline}</h1><div className="rich-text break-words" dangerouslySetInnerHTML={{ __html: preview.body_html }} /></div></div>}
  </section>;
}
function SocialEditor({ storyId, districtKey, timezone, editor, versions, assets, output, onSaved }: { storyId: string; districtKey: string; timezone: string; editor: boolean; versions: OutputVersion[]; assets: OutputAsset[]; output: SocialOutput | null; onSaved: (output: SocialOutput) => void }) {
  const state = useEditorialSave();
  const [media, setMedia] = useState(output?.asset_ids || []);
  const [id] = useState(() => output?.id || crypto.randomUUID());
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const readonly = !editor && output !== null && output.status !== "draft";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const data = await state.save("social", { ...Object.fromEntries(form), id, story_id: storyId, district_key: districtKey, revision: output?.revision || 0, asset_ids: media });
    if (data) onSaved(data.output);
  }
  return <div className="grid gap-4"><SaveFeedback state={state} /><form ref={formRef} onSubmit={submit} onChange={() => state.setDirty(true)}><fieldset disabled={state.busy || readonly} className="grid gap-4 md:grid-cols-2">
    <label className="grid gap-1 text-sm"><span>Destination</span><select name="destination" className={input} defaultValue={output?.destination || "Facebook"}>{SOCIAL_DESTINATIONS.map(d => <option key={d}>{d}</option>)}</select></label><VersionSelect versions={versions} value={output ? output.copy_version_id || "" : versions[0]?.id || ""} />
    <label className="grid gap-1 text-sm"><span>Status</span><select name="status" className={input} defaultValue={output?.status || "draft"}><option value="draft">Draft</option>{editor && <><option value="scheduled">Scheduled</option><option value="published">Published · Manual confirmation</option></>}{readonly && <option value={output?.status}>{output?.status}</option>}</select></label><label className="grid gap-1 text-sm"><span>Published URL · Optional</span><input type="url" name="published_url" maxLength={2000} className={input} defaultValue={output?.published_url || ""} /></label>
    <DateFields output={output} timezone={timezone} /><div className="md:col-span-2"><h3 className="mb-2 text-sm font-semibold">Media</h3><MediaOrder assets={assets} selected={media} onChange={ids => { setMedia(ids); state.setDirty(true); }} /></div><button className={button}>Save Social Output</button>
  </fieldset></form><button type="button" className="w-fit text-sm underline" onClick={async () => { const version = versions.find(v => v.id === new FormData(formRef.current!).get("copy_version_id")); if (!version) return; try { await navigator.clipboard.writeText(socialPlainText(version.body_html)); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copied" : "Copy Selected Social Text"}</button></div>;
}
export default function NrcsOutputEditor(props: { storyId: string; districtKey: string; timezone: string; editor: boolean; initialWeb: WebOutput | null; initialSocial: SocialOutput[]; webVersions: OutputVersion[]; socialVersions: OutputVersion[]; assets: OutputAsset[]; initialMedia: string[] }) {
  const [assets, setAssets] = useState(props.assets);
  const imageState = useEditorialSave();
  const [social, setSocial] = useState(props.initialSocial);
  const [selected, setSelected] = useState<string | null>(props.initialSocial[0]?.id || null);
  const [newKey, setNewKey] = useState(0);
  const [socialNotice, setSocialNotice] = useState("");
  return <div className="grid gap-8"><section className="grid gap-3"><h2 className="text-lg font-semibold">Story Images</h2><fieldset disabled={imageState.busy}><NrcsCloudinaryAssetPicker clientSubmit storyId={props.storyId} districtKey={props.districtKey} action={async form => { const data = await imageState.save("image", { ...Object.fromEntries(form), revision: 0 }); if (data) setAssets(list => [...list.filter(a => a.id !== data.asset.id), data.asset]); }} /></fieldset><SaveFeedback state={imageState} /></section><WebEditor {...props} assets={assets} versions={props.webVersions} /><section className="grid gap-4 border-t border-neutral-300 pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Social Outputs</h2><button type="button" className={button} onClick={() => { if (window.confirm("Open a new social output? Unsaved social changes will be discarded.")) { setSelected(null); setNewKey(k => k + 1); setSocialNotice(""); } }}>New Social Output</button></div><select aria-label="Select social output" className={input} value={selected || ""} onChange={e => { if (window.confirm("Switch social output? Unsaved social changes will be discarded.")) { setSelected(e.target.value || null); setSocialNotice(""); } }}><option value="">New output</option>{social.map(s => <option key={s.id} value={s.id}>{s.destination} · {s.status} · {s.id.slice(0, 8)}</option>)}</select>
    {socialNotice && <p role="status" className="border-l-4 border-green-600 bg-green-50 p-3 text-sm">{socialNotice}</p>}
    <SocialEditor key={selected || `new-${newKey}`} {...props} assets={assets} versions={props.socialVersions} output={social.find(s => s.id === selected) || null} onSaved={output => { setSocial(list => [output, ...list.filter(s => s.id !== output.id)]); setSelected(output.id); setSocialNotice("Social output saved."); }} />
  </section></div>;
}
