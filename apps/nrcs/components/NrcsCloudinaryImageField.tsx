"use client";

import { useState } from "react";
import NrcsCloudinaryPicker from "./NrcsCloudinaryPicker";

export default function NrcsCloudinaryImageField({ initialUrl, label, name }: {
  initialUrl?: string | null;
  label: string;
  name: string;
  originalImage?: boolean;
}) {
  const [url, setUrl] = useState(initialUrl || "");
  return (
    <div className="grid gap-2 text-sm">
      <span className="font-medium">{label}</span>
      <input type="hidden" name={name} value={url} />
      <div className="flex flex-wrap items-center gap-2">
        <NrcsCloudinaryPicker onSelect={(asset) => setUrl(asset.secure_url)} />
        {url && <button type="button" onClick={() => setUrl("")} className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold">Remove Image</button>}
      </div>
      {url ? <img src={url} alt="" className="max-h-64 w-fit rounded border border-neutral-200 object-contain" /> : <p className="rounded border border-dashed border-neutral-300 p-4 text-xs text-neutral-500">No image selected.</p>}
    </div>
  );
}
