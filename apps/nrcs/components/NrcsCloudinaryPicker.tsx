"use client";

import { useEffect, useRef, useState } from "react";

export type NrcsCloudinaryAsset = {
  id?: string;
  public_id: string;
  secure_url: string;
  width?: number | null;
  height?: number | null;
  format?: string | null;
  created_at?: string | null;
};

type LibraryResponse = { assets?: NrcsCloudinaryAsset[]; nextCursor?: string | null; error?: string };
type UploadConfig = { cloudName?: string; apiKey?: string; folder?: string; timestamp?: string; signature?: string; error?: string };

export default function NrcsCloudinaryPicker({ label = "Choose from Cloudinary", onSelect }: { label?: string; onSelect: (asset: NrcsCloudinaryAsset) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [assets, setAssets] = useState<NrcsCloudinaryAsset[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  async function loadAssets(nextCursor?: string | null) {
    setLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams();
      if (query.trim()) search.set("q", query.trim());
      if (nextCursor) search.set("cursor", nextCursor);
      const response = await fetch(`/api/cloudinary/assets?${search}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as LibraryResponse | null;
      if (!response.ok || !payload) throw new Error(payload?.error || "Unable to search Cloudinary.");
      setAssets((current) => nextCursor ? [...current, ...(payload.assets || [])] : payload.assets || []);
      setCursor(payload.nextCursor || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to search Cloudinary.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void loadAssets();
    const timer = window.setTimeout(() => searchInput.current?.focus(), 0);
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => { window.clearTimeout(timer); window.removeEventListener("keydown", close); };
    // Search terms are submitted explicitly; opening always refreshes the library.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const configResponse = await fetch("/api/cloudinary/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: "krtr", upload: true }),
      });
      const config = await configResponse.json().catch(() => null) as UploadConfig | null;
      if (!configResponse.ok || !config?.cloudName || !config.apiKey || !config.timestamp || !config.signature) throw new Error(config?.error || "Unable to authorize the upload.");
      const body = new FormData();
      body.set("file", file);
      body.set("api_key", config.apiKey);
      body.set("timestamp", config.timestamp);
      body.set("folder", config.folder || "krtr");
      body.set("unique_filename", "true");
      body.set("signature", config.signature);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, { method: "POST", body });
      const result = await response.json().catch(() => null) as NrcsCloudinaryAsset & { error?: { message?: string } } | null;
      if (!response.ok || !result?.public_id || !result.secure_url) throw new Error(result?.error?.message || "Cloudinary upload failed.");
      onSelect(result);
      setOpen(false);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Cloudinary upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold">{label}</button>
    {open && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-label="Cloudinary image library" className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded bg-white shadow-xl">
        <header className="flex items-center justify-between gap-3 border-b border-neutral-200 p-4">
          <h2 className="text-lg font-semibold">Cloudinary Images</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close Cloudinary image library" className="h-9 w-9 border border-neutral-300 text-xl">×</button>
        </header>
        <div className="grid gap-3 border-b border-neutral-200 p-4 md:grid-cols-[1fr_auto_auto]">
          <div className="flex gap-2">
            <input ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void loadAssets(); } }} placeholder="Search image names" className="min-w-0 flex-1 rounded border border-neutral-300 px-3 py-2" />
            <button type="button" disabled={loading} onClick={() => void loadAssets()} className="rounded bg-neutral-900 px-4 py-2 font-semibold text-white disabled:opacity-50">Search</button>
          </div>
          <label className="cursor-pointer rounded border border-neutral-300 px-4 py-2 text-center text-sm font-semibold">
            {uploading ? "Uploading..." : "Upload New"}
            <input type="file" accept="image/*" className="sr-only" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} />
          </label>
          <button type="button" onClick={() => setOpen(false)} className="rounded border border-neutral-300 px-4 py-2 text-sm font-semibold">Cancel</button>
        </div>
        {error && <p role="alert" className="mx-4 mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="grid min-h-48 flex-1 grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3 lg:grid-cols-4">
          {assets.map((asset) => <button key={asset.id || asset.public_id} type="button" onClick={() => { onSelect(asset); setOpen(false); }} className="grid content-start gap-2 border border-neutral-200 bg-white p-2 text-left hover:border-neutral-700 focus:border-neutral-900">
            <span className="aspect-video w-full bg-neutral-100"><img src={asset.secure_url} alt="" className="h-full w-full object-contain" loading="lazy" /></span>
            <span className="break-all text-xs font-medium">{asset.public_id.replace(/^krtr\//, "")}</span>
            {(asset.width || asset.height) && <span className="text-xs text-neutral-500">{asset.width || "?"} × {asset.height || "?"}</span>}
          </button>)}
          {!loading && assets.length === 0 && <p className="col-span-full text-sm text-neutral-500">No matching images found.</p>}
        </div>
        <footer className="flex items-center justify-center border-t border-neutral-200 p-3">
          {cursor && <button type="button" disabled={loading} onClick={() => void loadAssets(cursor)} className="rounded border border-neutral-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">{loading ? "Loading..." : "Load More"}</button>}
          {loading && !cursor && <span className="text-sm text-neutral-500">Loading images...</span>}
        </footer>
      </section>
    </div>}
  </>;
}
