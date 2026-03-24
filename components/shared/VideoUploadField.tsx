"use client";

import { useEffect, useRef, useState } from "react";
import { uploadToCloudinary } from "@/lib/cloudinary-upload";

type Props = {
  name: string;
  label: string;
  initialUrl?: string | null;
  folder?: string;
};

export default function VideoUploadField({
  name,
  label,
  initialUrl = null,
  folder = "krtr",
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [videoUrl, setVideoUrl] = useState<string>(initialUrl || "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form) return;
    const submitButtons = Array.from(
      form.querySelectorAll<HTMLButtonElement>("button[type='submit']")
    );
    submitButtons.forEach((button) => {
      button.disabled = uploading;
    });
    return () => {
      submitButtons.forEach((button) => {
        button.disabled = false;
      });
    };
  }, [uploading]);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const payload = await uploadToCloudinary({ file, folder, resourceType: "video" });
      setVideoUrl(payload.secure_url || "");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div ref={rootRef} className="grid gap-2">
      <label className="text-sm font-medium">{label}</label>
      <input type="hidden" name={name} value={videoUrl} onChange={() => {}} />
      <input
        type="file"
        accept="video/*"
        className="rounded border border-neutral-300 px-3 py-2 text-sm"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleUpload(file);
        }}
      />
      {uploading && <p className="text-xs text-neutral-500">Uploading video...</p>}
      {!uploading && videoUrl && (
        <p className="text-xs text-green-700">Video upload complete.</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {videoUrl && (
        <div className="grid gap-2">
          <video controls src={videoUrl} className="max-h-[250px] rounded border border-neutral-200" />
          <button
            type="button"
            className="w-fit text-xs text-neutral-600 underline"
            onClick={() => setVideoUrl("")}
          >
            Remove video
          </button>
        </div>
      )}
    </div>
  );
}
