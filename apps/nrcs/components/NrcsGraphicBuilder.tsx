"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { GraphicBuilder, GraphicContext } from "@/lib/graphics";

export default function NrcsGraphicBuilder({ builder, documentHtml, context, categories, tags }: {
  builder: GraphicBuilder; documentHtml: string; context: GraphicContext;
  categories: Array<{id:string;name:string}>; tags: Array<{id:string;name:string}>;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const saving = useRef(false);
  const snapshot = useRef<{blob:Blob;settings:unknown;id:string; fields:FormData} | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  useEffect(() => {
    async function receive(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || event.origin !== location.origin) return;
      const data = event.data;
      if (data?.type === "graphic-error") {
        if (timeout.current) clearTimeout(timeout.current);
        setError(data.message || "Rendering failed."); setBusy(false); saving.current = false;
      }
      if (data?.type === "graphic-status") setMessage(data.message);
      if (data?.type !== "graphic-captured" || !saving.current || !(data.blob instanceof Blob)) return;
      if (timeout.current) clearTimeout(timeout.current);
      const fields = snapshot.current?.fields;
      if (!fields) return;
      snapshot.current = { blob: data.blob, settings: data.settings, id: crypto.randomUUID(), fields };
      await upload();
    }
    window.addEventListener("message", receive);
    return () => { window.removeEventListener("message", receive); if (timeout.current) clearTimeout(timeout.current); };
  }, []);
  async function upload() {
    const value = snapshot.current;
    if (!value?.blob) return;
    setMessage("Saving to Cloudinary and NRCS..."); setError("");
    const body = new FormData();
    for (const [key, field] of value.fields) body.append(key, field);
    body.set("image", value.blob, "graphic.png");
    body.set("requestId", value.id);
    body.set("settings", JSON.stringify(value.settings));
    try {
      const response = await fetch("/api/graphics/save", { method:"POST", body, signal:AbortSignal.timeout(45000) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Save failed.");
      setMessage(payload.message); setSavedUrl(payload.url); snapshot.current = null;
    } catch (failure) { setMessage(""); setError(failure instanceof Error ? failure.message : "Save failed."); }
    finally { setBusy(false); saving.current = false; }
  }
  function save(fields: FormData) {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError(""); setMessage("Preparing PNG...");
    snapshot.current = {blob: new Blob(), settings: {}, id:"", fields};
    frame.current?.contentWindow?.postMessage({type:"capture-graphic"}, location.origin);
    timeout.current = setTimeout(() => { saving.current = false; setBusy(false); snapshot.current = null; setError("Rendering timed out. Try again."); }, 30000);
  }
  return <div className="grid gap-5 min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-3"><nav className="flex gap-3">{(["generic","sports","weather"] as const).map(kind => {
      const query = new URLSearchParams({district:context.districtKey, builder:kind});
      if(context.storyId) query.set("story",context.storyId);
      if(context.editionId) query.set("edition",context.editionId);
      if(context.itemId) query.set("item",context.itemId);
      return <Link key={kind} aria-current={builder === kind ? "page" : undefined} href={`/graphics?${query}`} className={`border-b-2 px-2 py-2 text-sm font-semibold capitalize ${builder === kind ? "border-neutral-900" : "border-transparent text-neutral-500"}`}>{kind}</Link>;
    })}</nav>
    {context.storyId && <Link href={`/stories/${context.storyId}?district=${context.districtKey}&tab=assets`} className="text-sm underline">Back to Story</Link>}
    {context.editionId && <Link href={`/editions/${context.editionId}`} className="text-sm underline">Back to Rundown</Link>}</div>
    {context.label && <p className="text-sm font-medium">{context.label}</p>}
    <div inert={busy} aria-busy={busy} className={busy ? "pointer-events-none opacity-75" : ""}>
      <iframe ref={frame} title={`${builder} graphic builder`} srcDoc={documentHtml} sandbox="allow-scripts allow-same-origin allow-downloads" className="h-[850px] w-full min-w-0 border border-neutral-300" />
    </div>
    <form action={save} className="grid gap-3 border-t border-neutral-300 pt-5">
      <input type="hidden" name="builder" value={builder} /><input type="hidden" name="districtKey" value={context.districtKey} />
      <input type="hidden" name="storyId" value={context.storyId || ""} /><input type="hidden" name="editionId" value={context.editionId || ""} /><input type="hidden" name="itemId" value={context.itemId || ""} />
      <fieldset disabled={busy} className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">Asset Title<input name="title" maxLength={240} required className="rounded border border-neutral-300 px-3 py-2" /></label>
        <label className="grid gap-1 text-sm">Category<select name="categoryId" className="rounded border border-neutral-300 px-3 py-2"><option value="">None</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <div className="grid gap-2 md:col-span-2">
          <label className="grid gap-1 text-sm">Tags<input type="search" value={tagSearch} onChange={event=>setTagSearch(event.target.value)} className="rounded border border-neutral-300 px-3 py-2" /></label>
          <div className="flex max-h-40 flex-wrap gap-3 overflow-auto">{tags.filter(tag => selectedTags.includes(tag.id) || tagSearch.trim() && tag.name.toLowerCase().includes(tagSearch.toLowerCase())).slice(0,50).map(tag => <label key={tag.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedTags.includes(tag.id)} onChange={event=>setSelectedTags(current=>event.target.checked ? [...current,tag.id] : current.filter(id=>id!==tag.id))} />{tag.name}</label>)}</div>
          {selectedTags.map(id=><input key={id} type="hidden" name="tagId" value={id} />)}
        </div>
        <button className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">{busy ? "Saving..." : "Save to Cloudinary"}</button>
      </fieldset>
    </form>
    {message && <p role="status" className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">{message}</p>}
    {error && <div role="alert" className="grid gap-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800"><p>{error}</p>{snapshot.current?.blob.size ? <button disabled={busy} onClick={()=>{if(saving.current)return; saving.current=true;setBusy(true);void upload();}} className="w-fit rounded border border-red-300 px-3 py-2">Retry Save</button> : null}</div>}
    {savedUrl && <img src={savedUrl} alt="Saved graphic" className="max-h-64 w-fit object-contain" />}
  </div>;
}
