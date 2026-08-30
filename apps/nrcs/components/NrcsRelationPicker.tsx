"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type RelationResult = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
};

type PickerKind = "event" | "story";

type Props = {
  kind: PickerKind;
  storyId: string;
  districtKey: string;
  fieldName: "event_id" | "related_story_id";
  action: (formData: FormData) => Promise<void>;
  excludeId?: string;
};

const PAGE_SIZE = 25;

function endpointFor(kind: PickerKind) {
  return kind === "event" ? "/api/events/search" : "/api/stories/search";
}

function titleFor(kind: PickerKind) {
  return kind === "event" ? "Link Event" : "Link Story";
}

export default function NrcsRelationPicker({
  kind,
  storyId,
  districtKey,
  fieldName,
  action,
  excludeId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [results, setResults] = useState<RelationResult[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const selectedRef = useRef<HTMLInputElement | null>(null);

  const trimmedQuery = query.trim();
  const canSearch = trimmedQuery.length === 0 || trimmedQuery.length >= 2;

  const baseSearchParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("district", districtKey);
    if (trimmedQuery.length >= 2) params.set("q", trimmedQuery);
    if (excludeId) params.set("exclude", excludeId);
    return params.toString();
  }, [districtKey, excludeId, trimmedQuery]);

  async function load(nextOffset = 0, append = false) {
    if (!canSearch) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams(baseSearchParams);
      params.set("offset", String(nextOffset));
      const response = await fetch(`${endpointFor(kind)}?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Unable to search ${kind}s.`);
      }
      const nextResults = (payload.results || []) as RelationResult[];
      setResults((current) => (append ? [...current, ...nextResults] : nextResults));
      setHasMore(Boolean(payload.hasMore));
      setOffset(nextOffset);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : `Unable to search ${kind}s.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    if (!canSearch) {
      setResults([]);
      setHasMore(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      void load(0, false);
    }, trimmedQuery ? 250 : 0);

    return () => window.clearTimeout(timeout);
    // load is intentionally not a dependency; searchParams captures the current query state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, baseSearchParams, canSearch, trimmedQuery]);

  function selectResult(id: string) {
    if (!selectedRef.current || !formRef.current) return;
    selectedRef.current.value = id;
    setOpen(false);
    formRef.current.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} action={action} className="hidden">
        <input type="hidden" name="story_id" value={storyId} />
        <input type="hidden" name="district_key" value={districtKey} />
        <input ref={selectedRef} type="hidden" name={fieldName} />
      </form>

      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setQuery("");
          setOffset(0);
        }}
        className="w-fit rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
      >
        {titleFor(kind)}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 p-4">
          <div className="mx-auto grid max-h-[90vh] max-w-3xl gap-4 overflow-auto rounded bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold">{titleFor(kind)}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-neutral-300 px-3 py-1 text-sm font-semibold"
              >
                Close
              </button>
            </div>

            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOffset(0);
              }}
              placeholder={`Search ${kind}s`}
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
              autoFocus
            />

            {!canSearch && <p className="text-sm text-neutral-500">Enter at least 2 characters to search.</p>}
            {loading && <p className="text-sm text-neutral-500">Loading...</p>}
            {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

            <div className="grid gap-2">
              {results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => selectResult(result.id)}
                  className="grid gap-1 rounded border border-neutral-200 p-3 text-left hover:border-neutral-400"
                >
                  <span className="font-medium">{result.title}</span>
                  <span className="text-sm text-neutral-600">{result.subtitle}</span>
                  <span className="text-xs text-neutral-500">{result.meta}</span>
                </button>
              ))}
              {!loading && results.length === 0 && canSearch && (
                <p className="text-sm text-neutral-500">No matching {kind}s found.</p>
              )}
            </div>

            {hasMore && (
              <button
                type="button"
                disabled={loading}
                onClick={() => void load(offset + PAGE_SIZE, true)}
                className="w-fit rounded border border-neutral-300 px-3 py-2 text-sm font-semibold disabled:opacity-60"
              >
                Load More
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
