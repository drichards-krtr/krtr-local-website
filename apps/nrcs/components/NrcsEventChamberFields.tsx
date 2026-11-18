"use client";

import { useState } from "react";
import { chamberLabel, eligibleChambers, type ChamberAssignment, type ChamberCatalog, type ChamberHighlightType } from "@/lib/chamberHighlights";

const inputClass = "rounded border border-neutral-300 px-3 py-2";

export default function NrcsEventChamberFields({ catalog, initialDistrict, districts, assignment }: {
  catalog: ChamberCatalog | null;
  initialDistrict: string;
  districts: { district_key: string; display_name: string }[];
  assignment?: ChamberAssignment | null;
}) {
  const [district, setDistrict] = useState(initialDistrict);
  const [id, setId] = useState(assignment?.chamber_id ?? "");
  const [type, setType] = useState<ChamberHighlightType | "">(assignment?.chamber_highlight_type ?? "");
  const options = catalog ? eligibleChambers(catalog, district) : [];
  const selected = options.find((option) => option.id === id);
  const saved = id && assignment?.chamber_id === id;
  const savedName = catalog?.accounts.find((account) => account.id === id)?.name;

  return (
    <>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">District</span>
        <select name="district_key" value={district} className={inputClass} onChange={(event) => {
          setDistrict(event.target.value);
          if (id !== assignment?.chamber_id && catalog &&
              !eligibleChambers(catalog, event.target.value).some((account) => account.id === id)) setId("");
        }}>
          {districts.map((option) => (
            <option key={option.district_key} value={option.district_key}>{option.display_name}</option>
          ))}
        </select>
      </label>
      <fieldset className="grid gap-2 rounded border border-neutral-200 p-3 text-sm">
        <legend className="font-semibold">Chamber Event Highlight</legend>
        <label className="grid gap-1">
          <span>Highlight type</span>
          <select name="chamber_highlight_type" value={type} className={inputClass}
            onChange={(event) => setType(event.target.value as ChamberHighlightType | "")}>
            <option value="">No Chamber Highlight</option>
            {(catalog || type === "chamber_hosted") && <option value="chamber_hosted">Event Hosted by Chamber</option>}
            {(catalog || type === "chamber_member") && <option value="chamber_member">Event Hosted by Chamber Member</option>}
          </select>
        </label>
        {!catalog && <p role="status">Chamber eligibility is temporarily unavailable.</p>}
        {type && (
          <label className="grid gap-1">
            <span>Chamber</span>
            <select name="chamber_id" value={id} required className={inputClass}
              onChange={(event) => setId(event.target.value)}>
              <option value="">Select a Chamber</option>
              {saved && !selected && <option value={id}>{savedName || "Saved Chamber"} (eligibility unavailable or inactive)</option>}
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                  {options.some((other) => other.id !== option.id && other.name === option.name)
                    && ` (${option.city}, ${option.id.slice(0, 8)})`}
                </option>
              ))}
            </select>
          </label>
        )}
        {type && selected && <p aria-live="polite">{chamberLabel(selected.name, type)}</p>}
        {type && saved && !selected && catalog && (
          <p role="status">The saved highlight is ineligible for public display in this district.
            {district !== initialDistrict && " Select an eligible Chamber or remove the highlight to move the event."}
          </p>
        )}
      </fieldset>
    </>
  );
}
