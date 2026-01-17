"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type Story = {
  id?: string;
  title: string;
  tease: string | null;
  body_markdown: string;
  status: "draft" | "published" | "archived";
  published_at: string | null;
  image_url: string | null;
  cloudinary_public_id: string | null;
  cloudinary_width: number | null;
  cloudinary_height: number | null;
  mux_playback_id: string | null;
  mux_status: string | null;
};

type Props = {
  initialStory?: Story;
};

export default function StoryEditor({ initialStory }: Props) {
  const [form, setForm] = useState<Story>({
    title: initialStory?.title || "",
    tease: initialStory?.tease || "",
    body_markdown: initialStory?.body_markdown || "",
    status: initialStory?.status || "draft",
    published_at: initialStory?.published_at || null,
    image_url: initialStory?.image_url || null,
    cloudinary_public_id: initialStory?.cloudinary_public_id || null,
    cloudinary_width: initialStory?.cloudinary_width || null,
    cloudinary_height: initialStory?.cloudinary_height || null,
    mux_playback_id: initialStory?.mux_playback_id || null,
    mux_status: initialStory?.mux_status || "none",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isEdit = !!initialStory?.id;
  const preview = useMemo(() => form.body_markdown || "", [form.body_markdown]);

  const saveStory = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    const supabase = createBrowserSupabase();

    const payload = {
      title: form.title,
      tease: form.tease || null,
      body_markdown: form.body_markdown,
      status: form.status,
      published_at:
        form.status === "published"
          ? form.published_at || new Date().toISOString()
          : null,
      image_url: form.image_url,
      cloudinary_public_id: form.cloudinary_public_id,
      cloudinary_width: form.cloudinary_width,
      cloudinary_height: form.cloudinary_height,
      mux_playback_id: form.mux_playback_id,
      mux_status: form.mux_status,
    };

    const response = isEdit
      ? await supabase.from("stories").update(payload).eq("id", initialStory?.id)
      : await supabase.from("stories").insert(payload).select("id").single();

    if (response.error) {
      setError(response.error.message);
    } else {
      setSuccess("Saved.");
      if (!isEdit) {
        const newId = response.data?.id;
        if (newId) {
          window.location.href = `/cms/stories/${newId}`;
        }
      }
    }
    setSaving(false);
  };

  const handleImageUpload = async (file: File) => {
    const signatureRes = await fetch("/api/cloudinary/signature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: "krtr" }),
    });
    if (!signatureRes.ok) {
      setError("Unable to sign Cloudinary upload.");
      return;
    }
    const { signature, timestamp, apiKey, cloudName } =
      await signatureRes.json();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("api_key", apiKey);
    formData.append("timestamp", timestamp);
    formData.append("signature", signature);
    formData.append("folder", "krtr");

    const uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: "POST",
        body: formData,
      }
    );
    if (!uploadRes.ok) {
      setError("Image upload failed.");
      return;
    }
    const payload = await uploadRes.json();
    setForm((prev) => ({
      ...prev,
      image_url: payload.secure_url,
      cloudinary_public_id: payload.public_id,
      cloudinary_width: payload.width,
      cloudinary_height: payload.height,
    }));
  };

  const handleVideoUpload = async (file: File) => {
    if (!initialStory?.id) {
      setError("Save the story before uploading video.");
      return;
    }
    setForm((prev) => ({ ...prev, mux_status: "uploading" }));
    const response = await fetch("/api/mux/create-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storyId: initialStory.id }),
    });
    if (!response.ok) {
      setError("Unable to create Mux upload.");
      return;
    }
    const { uploadUrl } = await response.json();
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
    });
    if (!uploadRes.ok) {
      setError("Video upload failed.");
      return;
    }
    setForm((prev) => ({ ...prev, mux_status: "processing" }));
    const supabase = createBrowserSupabase();
    await supabase
      .from("stories")
      .update({ mux_status: "processing" })
      .eq("id", initialStory.id);
  };

  return (
    <div className="grid gap-6">
      <section className="rounded border border-neutral-200 bg-white p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Title</label>
            <input
              value={form.title}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, title: event.target.value }))
              }
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Status</label>
            <select
              value={form.status}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  status: event.target.value as Story["status"],
                }))
              }
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className="text-sm font-medium">Tease</label>
          <textarea
            value={form.tease || ""}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, tease: event.target.value }))
            }
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            rows={3}
          />
        </div>
      </section>

      <section className="rounded border border-neutral-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Story Body</h2>
          <span className="text-xs text-neutral-500">Markdown supported</span>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <textarea
            value={form.body_markdown}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                body_markdown: event.target.value,
              }))
            }
            className="min-h-[320px] w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <div className="min-h-[320px] rounded border border-neutral-200 bg-neutral-50 p-4 text-sm">
            <ReactMarkdown>{preview}</ReactMarkdown>
          </div>
        </div>
      </section>

      <section className="rounded border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Media</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Hero Image</label>
            <input
              type="file"
              accept="image/*"
              className="mt-2 w-full text-sm"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleImageUpload(file);
              }}
            />
            {form.image_url && (
              <div className="mt-3">
                <img
                  src={form.image_url}
                  alt=""
                  className="w-full rounded border"
                />
                <button
                  type="button"
                  className="mt-2 text-sm text-neutral-500 underline"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      image_url: null,
                      cloudinary_public_id: null,
                      cloudinary_width: null,
                      cloudinary_height: null,
                    }))
                  }
                >
                  Remove image
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="text-sm font-medium">Video Upload</label>
            <p className="text-xs text-neutral-500">
              Status: {form.mux_status || "none"}
            </p>
            <input
              type="file"
              accept="video/*"
              className="mt-2 w-full text-sm"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleVideoUpload(file);
              }}
            />
            {form.mux_playback_id && (
              <p className="mt-2 text-xs text-neutral-500">
                Playback ID: {form.mux_playback_id}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={saveStory}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Story"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}
      </div>
    </div>
  );
}
