"use client";

import { useEffect, useId, useRef, useState } from "react";
type Result = { id: string; title: string; subtitle?: string; thumbnail?: string | null };
export default function NrcsEditorialPicker({ label, type, districtKey, value, onChange, editionId, refreshKey = 0 }: { label: string; type: "output" | "story" | "event" | "edition" | "asset" | "library"; districtKey: string; value: string; onChange: (id: string) => void; editionId?: string; refreshKey?: number }) {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [selected, setSelected] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const base = `/api/editorial/homepage?type=${type}&district=${encodeURIComponent(districtKey)}&refresh=${refreshKey}${editionId ? `&edition=${editionId}` : ""}`;
  useEffect(() => {
    setSelected(null); if (!value) return;
    const controller = new AbortController();
    fetch(`${base}&selected=${value}`, { signal: controller.signal }).then(r => r.json()).then(data => { if (!controller.signal.aborted) setSelected(data.results?.[0] || { id: value, title: "Unavailable selection" }); }).catch(() => {});
    return () => controller.abort();
  }, [base, value]);
  async function load(offset = 0) {
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller; setBusy(true); setError("");
    try {
      const response = await fetch(`${base}&q=${encodeURIComponent(query)}&offset=${offset}`, { signal: controller.signal });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Search failed.");
      if (!controller.signal.aborted) { setResults(prev => offset ? [...prev, ...data.results] : data.results); setMore(data.hasMore); }
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Search failed."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  // Offset counts server rows, including unready Edition assets omitted from results.
  const [offset, setOffset] = useState(0);
  useEffect(() => { if (!open || type === "asset" && !editionId) return; setOffset(0); const timer = setTimeout(() => void load(0), 250); return () => { clearTimeout(timer); abort.current?.abort(); }; }, [open, query, base]);
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("keydown", close); document.addEventListener("mousedown", outside);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("mousedown", outside); };
  }, [open]);
  return <div ref={root} className="relative grid min-w-0 gap-1 text-sm"><span id={labelId} className="font-medium">{label}</span><div className="flex min-w-0 gap-2"><button ref={button} type="button" disabled={type === "asset" && !editionId} aria-labelledby={`${labelId} ${labelId}-value`} aria-expanded={open} className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-3 py-2 text-left disabled:opacity-50" onClick={() => setOpen(!open)}><span id={`${labelId}-value`} className="block truncate">{selected?.title || (value ? "Loading selection…" : "None selected")}</span></button>{value && <button type="button" aria-label={`Clear ${label}`} title={`Clear ${label}`} className="h-9 w-9 border" onClick={() => { onChange(""); setSelected(null); }}>×</button>}</div>
    {open && <div className="absolute left-0 right-0 top-full z-30 mt-1 grid gap-2 rounded border border-neutral-300 bg-white p-3 shadow-lg"><input ref={search} aria-label={`Search ${label}`} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" className="w-full rounded border px-3 py-2" /><div className="max-h-64 overflow-y-auto">{results.map(row => <button key={row.id} type="button" className="flex w-full items-center gap-2 border-b p-2 text-left hover:bg-neutral-100" onClick={() => { setSelected(row); onChange(row.id); setOpen(false); button.current?.focus(); }}>{row.thumbnail && <img alt="" src={row.thumbnail} className="h-10 w-14 object-contain" />}<span className="min-w-0 break-words">{row.title}<span className="block text-xs text-neutral-500">{row.subtitle}</span></span></button>)}{!busy && results.length === 0 && <p className="py-2">No matches.</p>}</div>{busy && <p role="status">Loading…</p>}{error && <p role="alert" className="text-red-700">{error}</p>}{more && <button type="button" disabled={busy} className="text-left underline" onClick={() => { const next = offset + 25; setOffset(next); void load(next); }}>Load More</button>}<button type="button" className="text-right underline" onClick={() => { setOpen(false); button.current?.focus(); }}>Close</button></div>}
  </div>;
}
