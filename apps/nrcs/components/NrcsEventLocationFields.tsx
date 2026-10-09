"use client";

import { useEffect, useRef, useState } from "react";

type Location = { id: string; name: string; address: string; city: string; state: string; zip: string };
type Values = { location_name: string; address: string; city: string; state: string; zip: string };

export default function NrcsEventLocationFields({ initial }: { initial: Values }) {
  const [values, setValues] = useState(initial);
  const [results, setResults] = useState<Location[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = values.location_name.trim();
    if (query.length < 2) { setResults([]); setOpen(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const form = root.current?.closest("form");
      const district = (form?.elements.namedItem("district_key") as HTMLSelectElement | null)?.value || "";
      if (!district) return;
      setLoading(true);
      try {
        const response = await fetch(`/api/locations/search?${new URLSearchParams({ district, q: query })}`, { signal: controller.signal, cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || "Location search failed.");
        setResults(payload?.results || []);
        setOpen((payload?.results || []).length > 0);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) { setResults([]); setOpen(false); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [values.location_name]);

  function change(field: keyof Values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function select(location: Location) {
    setValues({ location_name: location.name, address: location.address, city: location.city, state: location.state, zip: location.zip });
    setResults([]);
    setOpen(false);
  }

  const fieldClass = "rounded border border-neutral-300 px-3 py-2";
  return <div ref={root} className="contents">
    <label className="relative grid gap-1 text-sm">
      <span className="font-medium">Location Name</span>
      <input name="location_name" value={values.location_name} onChange={(event) => change("location_name", event.target.value)} onFocus={() => results.length > 0 && setOpen(true)} autoComplete="off" className={fieldClass} aria-autocomplete="list" aria-expanded={open} />
      {loading && <span className="absolute right-3 top-9 text-xs text-neutral-500">Searching...</span>}
      {open && <div role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto border border-neutral-300 bg-white shadow-lg">
        {results.map((location) => <button key={location.id} type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => select(location)} className="grid w-full gap-1 border-b border-neutral-100 px-3 py-2 text-left hover:bg-neutral-50">
          <span className="font-semibold">{location.name}</span>
          <span className="text-xs text-neutral-600">{location.address}, {location.city}, {location.state} {location.zip}</span>
        </button>)}
      </div>}
    </label>
    {(["address", "city", "state", "zip"] as const).map((field) => <label key={field} className="grid gap-1 text-sm">
      <span className="font-medium">{field === "zip" ? "ZIP" : field[0].toUpperCase() + field.slice(1)}</span>
      <input name={field} value={values[field]} onChange={(event) => change(field, event.target.value)} className={fieldClass} />
    </label>)}
  </div>;
}
