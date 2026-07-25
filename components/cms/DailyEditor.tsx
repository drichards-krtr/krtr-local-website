"use client";

import { useState } from "react";
import CloudinaryMediaLibraryField from "@/components/cms/CloudinaryMediaLibraryField";
import { buildDailySlug } from "@/lib/dailys";
import { getDateTimeTextInTimeZone, naiveDateTimeTextToUtcIso } from "@/lib/dates";
import { DISTRICT_OPTIONS, type DistrictKey } from "@/lib/districts";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type Daily = {
  id?: string;
  district_key: DistrictKey;
  title: string;
  status: "draft" | "published" | "archived";
  published_at: string | null;
  image_url: string | null;
  cloudinary_public_id: string | null;
  cloudinary_width: number | null;
  cloudinary_height: number | null;
  mux_asset_id: string | null;
  mux_upload_id: string | null;
  mux_playback_id: string | null;
  mux_status: string | null;
  video_orientation: "vertical" | "horizontal";
  slug?: string | null;
};

type Props = {
  initialDaily?: Daily;
  initialDistrictKey: DistrictKey;
};

export default function DailyEditor({ initialDaily, initialDistrictKey }: Props) {
  const [form, setForm] = useState<Daily>({
    district_key: initialDaily?.district_key || initialDistrictKey,
    title: initialDaily?.title || "",
    status: initialDaily?.status || "draft",
    published_at: initialDaily?.published_at || null,
    image_url: initialDaily?.image_url || null,
    cloudinary_public_id: initialDaily?.cloudinary_public_id || null,
    cloudinary_width: initialDaily?.cloudinary_width || null,
    cloudinary_height: initialDaily?.cloudinary_height || null,
    mux_asset_id: initialDaily?.mux_asset_id || null,
    mux_upload_id: initialDaily?.mux_upload_id || null,
    mux_playback_id: initialDaily?.mux_playback_id || null,
    mux_status: initialDaily?.mux_status || "none",
    video_orientation: initialDaily?.video_orientation || "vertical",
    slug: initialDaily?.slug || null,
  });
  const [saving, setSaving] = useState(false);
  const [refreshingMux, setRefreshingMux] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isEdit = !!initialDaily?.id;
  const scheduledPublishValue = form.published_at
    ? getDateTimeTextInTimeZone(new Date(form.published_at)).slice(0, 16)
    : "";

  const saveDaily = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    const supabase = createBrowserSupabase();
    const effectivePublishedAt =
      form.status === "published"
        ? form.published_at || new Date().toISOString()
        : form.published_at;

    const baseSlug = buildDailySlug(form.title, effectivePublishedAt);
    let slug = baseSlug;
    let suffix = 2;
    while (true) {
      let query = supabase
        .from("dailys")
        .select("id")
        .eq("district_key", form.district_key)
        .eq("slug", slug)
        .limit(1);
      if (isEdit && initialDaily?.id) {
        query = query.neq("id", initialDaily.id);
      }
      const { data: existing, error: slugCheckError } = await query;
      if (slugCheckError) {
        setError(slugCheckError.message);
        setSaving(false);
        return;
      }
      if (!existing || existing.length === 0) break;
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const payload = {
      district_key: form.district_key,
      title: form.title,
      status: form.status,
      published_at:
        form.status === "published"
          ? form.published_at || new Date().toISOString()
          : null,
      image_url: form.image_url,
      cloudinary_public_id: form.cloudinary_public_id,
      cloudinary_width: form.cloudinary_width,
      cloudinary_height: form.cloudinary_height,
      mux_asset_id: form.mux_asset_id,
      mux_upload_id: form.mux_upload_id,
      mux_playback_id: form.mux_playback_id,
      mux_status: form.mux_status,
      video_orientation: form.video_orientation,
      slug,
    };

    const response = isEdit
      ? await supabase.from("dailys").update(payload).eq("id", initialDaily?.id)
      : await supabase.from("dailys").insert(payload).select("id").single();

    if (response.error) {
      setError(response.error.message);
      setSaving(false);
      return;
    }

    setSuccess("Saved.");
    window.location.href = `/cms/dailys?district=${form.district_key}`;
    setSaving(false);
  };

  const handleVideoUpload = async (file: File) => {
    if (!initialDaily?.id) {
      setError("Save the Daily before uploading video.");
      return;
    }
    setError(null);
    setForm((prev) => ({ ...prev, mux_status: "uploading" }));
    const response = await fetch("/api/mux/create-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dailyId: initialDaily.id }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setForm((prev) => ({ ...prev, mux_status: initialDaily.mux_status || "none" }));
      setError(payload?.error || "Unable to create Mux upload.");
      return;
    }
    const { uploadUrl, uploadId } = await response.json();
    setForm((prev) => ({
      ...prev,
      mux_upload_id: uploadId || prev.mux_upload_id,
      mux_asset_id: null,
      mux_playback_id: null,
    }));
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: file.type ? { "Content-Type": file.type } : undefined,
    });
    if (!uploadRes.ok) {
      setForm((prev) => ({ ...prev, mux_status: "errored" }));
      setError("Video upload failed.");
      return;
    }
    setForm((prev) => ({ ...prev, mux_status: "processing" }));
    await createBrowserSupabase()
      .from("dailys")
      .update({ mux_status: "processing" })
      .eq("district_key", form.district_key)
      .eq("id", initialDaily.id);
  };

  const refreshMuxStatus = async () => {
    if (!initialDaily?.id) {
      setError("Save the Daily before refreshing Mux status.");
      return;
    }

    setRefreshingMux(true);
    setError(null);
    setSuccess(null);

    const saveIds = await createBrowserSupabase()
      .from("dailys")
      .update({
        mux_asset_id: form.mux_asset_id,
        mux_upload_id: form.mux_upload_id,
      })
      .eq("district_key", form.district_key)
      .eq("id", initialDaily.id);

    if (saveIds.error) {
      setRefreshingMux(false);
      setError(saveIds.error.message);
      return;
    }

    const response = await fetch("/api/mux/sync-daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dailyId: initialDaily.id }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setRefreshingMux(false);
      setError(payload?.error || "Unable to refresh Mux status.");
      return;
    }

    setForm((prev) => ({
      ...prev,
      mux_asset_id: payload.mux_asset_id || prev.mux_asset_id,
      mux_upload_id: payload.mux_upload_id || prev.mux_upload_id,
      mux_playback_id: payload.mux_playback_id || null,
      mux_status: payload.mux_status || "none",
    }));
    setSuccess("Mux status refreshed.");
    setRefreshingMux(false);
  };

  return (
    <div className="grid gap-6">
      <section className="rounded border border-neutral-200 bg-white p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium">District</label>
            <select
              value={form.district_key}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, district_key: event.target.value as DistrictKey }))
              }
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            >
              {DISTRICT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium">Title</label>
            <input
              required
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Status</label>
            <select
              value={form.status}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  status: event.target.value as Daily["status"],
                }))
              }
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Publish Date/Time</label>
            <input
              type="datetime-local"
              value={scheduledPublishValue}
              onChange={(event) => {
                const isoValue = event.target.value
                  ? naiveDateTimeTextToUtcIso(event.target.value)
                  : null;
                setForm((prev) => ({ ...prev, published_at: isoValue }));
              }}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Leave blank to publish immediately when status is Published.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Media</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <CloudinaryMediaLibraryField
            name="image_url"
            label="Thumbnail Image"
            folder="krtr/dailys"
            initialUrl={form.image_url}
            onUpload={(payload) =>
              setForm((prev) => ({
                ...prev,
                image_url: payload.secure_url || null,
                cloudinary_public_id: payload.public_id || null,
                cloudinary_width: payload.width || null,
                cloudinary_height: payload.height || null,
              }))
            }
            onRemove={() =>
              setForm((prev) => ({
                ...prev,
                image_url: null,
                cloudinary_public_id: null,
                cloudinary_width: null,
                cloudinary_height: null,
              }))
            }
          />
          <div>
            <label className="text-sm font-medium">Video Upload</label>
            <label className="mt-2 grid gap-1 text-sm font-medium text-neutral-700">
              <span>Video Orientation</span>
              <select
                required
                value={form.video_orientation}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    video_orientation: event.target.value as Daily["video_orientation"],
                  }))
                }
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="vertical">Vertical</option>
                <option value="horizontal">Horizontal</option>
              </select>
            </label>
            <p className="text-xs text-neutral-500">Status: {form.mux_status || "none"}</p>
            <input
              type="file"
              accept="video/*"
              className="mt-2 w-full text-sm"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleVideoUpload(file);
              }}
            />
            <div className="mt-3 grid gap-3">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Mux Asset ID
                </label>
                <input
                  value={form.mux_asset_id || ""}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, mux_asset_id: event.target.value || null }))
                  }
                  className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Mux Upload ID
                </label>
                <input
                  value={form.mux_upload_id || ""}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, mux_upload_id: event.target.value || null }))
                  }
                  className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={refreshMuxStatus}
              className="mt-3 rounded border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 disabled:opacity-60"
              disabled={refreshingMux}
            >
              {refreshingMux ? "Refreshing..." : "Refresh from Mux"}
            </button>
            {form.mux_playback_id && (
              <p className="mt-2 text-xs text-neutral-500">Playback ID: {form.mux_playback_id}</p>
            )}
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={saveDaily}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Daily"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}
      </div>
    </div>
  );
}
