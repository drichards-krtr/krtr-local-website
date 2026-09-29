"use client";

import { useState } from "react";
import NrcsCloudinaryPicker, { type NrcsCloudinaryAsset } from "./NrcsCloudinaryPicker";

export default function NrcsCloudinaryAssetPicker({ action, storyId, editionId, districtKey, categoryId, label = "Choose Image/Graphic", clientSubmit = false, submitLabel = "Attach Selected" }: {
  action: (formData: FormData) => Promise<void>;
  storyId?: string;
  editionId?: string;
  districtKey: string;
  categoryId?: string | null;
  label?: string;
  clientSubmit?: boolean;
  submitLabel?: string;
}) {
  const [selected, setSelected] = useState<NrcsCloudinaryAsset | null>(null);
  return (
    <form action={clientSubmit ? undefined : action} onSubmit={clientSubmit ? event => { event.preventDefault(); void action(new FormData(event.currentTarget)); } : undefined} className="grid gap-3 rounded border border-neutral-200 p-4">
      <input type="hidden" name="story_id" value={storyId || ""} />
      <input type="hidden" name="edition_id" value={editionId || ""} />
      <input type="hidden" name="district_key" value={districtKey} />
      <input type="hidden" name="category_id" value={categoryId || ""} />
      <input type="hidden" name="asset_type" value="image" />
      <input type="hidden" name="cloudinary_url" value={selected?.secure_url || ""} />
      <input type="hidden" name="cloudinary_public_id" value={selected?.public_id || ""} />
      <input type="hidden" name="title" value={selected?.public_id || "Cloudinary image"} />
      <div className="flex flex-wrap items-center gap-3">
        <NrcsCloudinaryPicker label={label} onSelect={setSelected} />
        <button disabled={!selected?.secure_url} className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{submitLabel}</button>
      </div>
      {selected?.secure_url && <img src={selected.secure_url} alt="" className="max-h-48 w-fit rounded border border-neutral-200 object-contain" />}
    </form>
  );
}
