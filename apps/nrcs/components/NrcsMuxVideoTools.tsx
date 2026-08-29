"use client";

import { useMemo, useState } from "react";

type CategoryOption = {
  id: string;
  name: string;
};

type TagOption = {
  id: string;
  name: string;
  tag_type: string;
};

type VideoResult = {
  id: string;
  title: string;
  district_key: string | null;
  category_name: string | null;
  mux_status: string;
  mux_playback_id: string | null;
  thumbnail_url: string | null;
  selectable: boolean;
};

export function NrcsMuxUploader({
  storyId,
  districtKey,
  categoryId,
  categories,
  tags,
}: {
  storyId: string;
  districtKey: string;
  categoryId?: string | null;
  categories: CategoryOption[];
  tags: TagOption[];
}) {
  const [title, setTitle] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState(categoryId || "");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadVideo(file: File) {
    setUploading(true);
    setStatus("Creating Mux upload...");
    setError(null);
    try {
      const response = await fetch("/api/mux/create-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId,
          districtKey,
          title: title || file.name,
          categoryId: selectedCategoryId || null,
          tagIds: selectedTagIds,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.uploadUrl) {
        throw new Error(payload?.error || "Unable to create Mux upload.");
      }

      setStatus("Uploading video...");
      const uploadResponse = await fetch(payload.uploadUrl, {
        method: "PUT",
        body: file,
        headers: file.type ? { "Content-Type": file.type } : undefined,
      });
      if (!uploadResponse.ok) throw new Error("Video upload failed.");
      setStatus("Video uploaded. Use Refresh Status until Mux reports ready.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Video upload failed.");
      setStatus(null);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-3 rounded border border-neutral-200 p-4">
      <h3 className="font-semibold">Upload New Video</h3>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Video title"
        className="rounded border border-neutral-300 px-3 py-2 text-sm"
      />
      <select
        value={selectedCategoryId}
        onChange={(event) => setSelectedCategoryId(event.target.value)}
        className="rounded border border-neutral-300 px-3 py-2 text-sm"
      >
        <option value="">No category</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <select
        multiple
        value={selectedTagIds}
        onChange={(event) => setSelectedTagIds(Array.from(event.currentTarget.selectedOptions).map((option) => option.value))}
        className="min-h-[90px] rounded border border-neutral-300 px-3 py-2 text-sm"
      >
        {tags.map((tag) => (
          <option key={tag.id} value={tag.id}>
            {tag.name} ({tag.tag_type.replace("_", " ")})
          </option>
        ))}
      </select>
      <input
        type="file"
        accept="video/*"
        disabled={uploading}
        className="rounded border border-neutral-300 px-3 py-2 text-sm"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) uploadVideo(file);
        }}
      />
      {status && <p className="text-xs text-neutral-600">{status}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function NrcsMuxLibraryPicker({
  storyId,
  districtKey,
  categories,
  tags,
}: {
  storyId: string;
  districtKey: string;
  categories: CategoryOption[];
  tags: TagOption[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [tagId, setTagId] = useState("");
  const [allDistricts, setAllDistricts] = useState(false);
  const [loading, setLoading] = useState(false);
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("district", districtKey);
    if (allDistricts) params.set("allDistricts", "1");
    if (search.trim()) params.set("search", search.trim());
    if (categoryId) params.set("category", categoryId);
    if (tagId) params.set("tag", tagId);
    return params.toString();
  }, [allDistricts, categoryId, districtKey, search, tagId]);

  async function loadVideos() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/mux/library?${queryString}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to load Mux videos.");
      setVideos(payload.videos || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load Mux videos.");
    } finally {
      setLoading(false);
    }
  }

  async function insertVideo(assetId: string) {
    setError(null);
    const response = await fetch(`/api/stories/${storyId}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId, relationship: "video" }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      setError(payload?.error || "Unable to attach video.");
      return;
    }
    setOpen(false);
    window.location.reload();
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTimeout(loadVideos, 0);
        }}
        className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold"
      >
        Choose Mux Video
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 p-4">
          <div className="mx-auto grid max-h-[90vh] max-w-5xl gap-4 overflow-auto rounded bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Choose Mux Video</h3>
                <p className="text-sm text-neutral-500">Processing videos are visible but cannot be inserted until ready.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-neutral-300 px-3 py-1 text-sm font-semibold"
              >
                Close
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto]">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title"
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="rounded border border-neutral-300 px-3 py-2 text-sm">
                <option value="">All categories</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <select value={tagId} onChange={(event) => setTagId(event.target.value)} className="rounded border border-neutral-300 px-3 py-2 text-sm">
                <option value="">All tags</option>
                {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
              </select>
              <button type="button" onClick={loadVideos} className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
                Search
              </button>
            </div>
            <label className="inline-flex w-fit items-center gap-2 text-sm">
              <input type="checkbox" checked={allDistricts} onChange={(event) => setAllDistricts(event.target.checked)} />
              All districts
            </label>
            {loading && <p className="text-sm text-neutral-500">Loading videos...</p>}
            {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="grid gap-3 md:grid-cols-2">
              {videos.map((video) => (
                <div key={video.id} className="grid grid-cols-[120px_1fr] gap-3 rounded border border-neutral-200 p-3">
                  <div className="aspect-video bg-neutral-100">
                    {video.thumbnail_url ? <img src={video.thumbnail_url} alt="" className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium">{video.title}</div>
                    <div className="text-xs text-neutral-500">
                      {video.category_name || "No category"} - {video.district_key || "shared"} - {video.mux_status}
                    </div>
                    <button
                      type="button"
                      disabled={!video.selectable}
                      onClick={() => insertVideo(video.id)}
                      className="mt-3 rounded bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white disabled:bg-neutral-300"
                    >
                      {video.selectable ? "Insert Video" : "Not Ready"}
                    </button>
                  </div>
                </div>
              ))}
              {!loading && videos.length === 0 && <p className="text-sm text-neutral-500">No videos match this search.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
