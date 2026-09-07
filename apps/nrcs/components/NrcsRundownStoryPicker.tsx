"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Result = {
  copyVersionId: string;
  title: string;
  defaultItemTitle: string;
  subtitle: string;
  meta: string;
};

type Props = {
  action: (formData: FormData) => Promise<void>;
  districtKey: string;
  editionId: string;
};

const PAGE_SIZE = 25;

export default function NrcsRundownStoryPicker({ action, districtKey, editionId }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const copyVersionRef = useRef<HTMLInputElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);

  const trimmedQuery = query.trim();
  const canSearch = trimmedQuery.length === 0 || trimmedQuery.length >= 2;
  const baseSearchParams = useMemo(() => {
    const params = new URLSearchParams({ district: districtKey });
    if (trimmedQuery.length >= 2) params.set("q", trimmedQuery);
    return params.toString();
  }, [districtKey, trimmedQuery]);

  async function load(nextOffset = 0, append = false) {
    if (!canSearch) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams(baseSearchParams);
      params.set("offset", String(nextOffset));
      const response = await fetch(`/api/rundown-stories/search?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to search Rundown Copy.");
      const nextResults = (payload.results || []) as Result[];
      setResults((current) => (append ? [...current, ...nextResults] : nextResults));
      setHasMore(Boolean(payload.hasMore));
      setOffset(nextOffset);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to search Rundown Copy.");
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
    // load is intentionally not a dependency; baseSearchParams carries query state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, baseSearchParams, canSearch, trimmedQuery]);

  function selectResult(result: Result) {
    if (!formRef.current || !copyVersionRef.current || !titleRef.current) return;
    copyVersionRef.current.value = result.copyVersionId;
    titleRef.current.value = result.defaultItemTitle;
    setOpen(false);
    formRef.current.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} action={action} className="hidden">
        <input type="hidden" name="edition_id" value={editionId} />
        <input type="hidden" name="item_type" value="story" />
        <input ref={copyVersionRef} type="hidden" name="copy_version_id" />
        <input ref={titleRef} type="hidden" name="title" />
      </form>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setQuery("");
          setOffset(0);
        }}
        className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
      >
        Search Stories To Add
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 p-4">
          <div className="mx-auto grid max-h-[90vh] max-w-3xl gap-4 overflow-auto rounded bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold">Add Story To Rundown</h3>
              <button type="button" onClick={() => setOpen(false)} className="rounded border border-neutral-300 px-3 py-1 text-sm font-semibold">
                Close
              </button>
            </div>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOffset(0);
              }}
              placeholder="Search stories with Rundown Copy"
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
              autoFocus
            />
            {!canSearch && <p className="text-sm text-neutral-500">Enter at least 2 characters to search.</p>}
            {loading && <p className="text-sm text-neutral-500">Loading...</p>}
            {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="grid gap-2">
              {results.map((result) => (
                <button
                  key={result.copyVersionId}
                  type="button"
                  onClick={() => selectResult(result)}
                  className="grid gap-1 rounded border border-neutral-200 p-3 text-left hover:border-neutral-400"
                >
                  <span className="font-medium">{result.title}</span>
                  <span className="text-sm text-neutral-600">{result.subtitle}</span>
                  <span className="text-xs text-neutral-500">{result.meta}</span>
                </button>
              ))}
              {!loading && results.length === 0 && canSearch && <p className="text-sm text-neutral-500">No matching Rundown Copy found.</p>}
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
