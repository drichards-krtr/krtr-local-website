"use client";

import { useEffect, useRef, useState } from "react";
import { uploadToCloudinary } from "@/lib/cloudinary-upload";

type Props = {
  name: string;
  label: string;
  initialUrl?: string | null;
  folder?: string;
};

export default function ImageUploadField({
  name,
  label,
  initialUrl = null,
  folder = "krtr",
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [imageUrl, setImageUrl] = useState<string>(initialUrl || "");
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
      const payload = await uploadToCloudinary({ file, folder, resourceType: "image" });
      setImageUrl(payload.secure_url || "");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div ref={rootRef} className="grid min-w-0 gap-2">
      <label className="text-sm font-medium">{label}</label>
      <input
        type="hidden"
        name={name}
        value={imageUrl}
        onChange={() => {}}
      />
      <input
        type="file"
        accept="image/*"
        className="min-w-0 w-full max-w-full rounded border border-neutral-300 px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleUpload(file);
        }}
      />
      {uploading && <p className="text-xs text-neutral-500">Uploading image...</p>}
      {!uploading && imageUrl && (
        <p className="text-xs text-green-700">Image upload complete.</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {imageUrl && (
        <div className="grid gap-2">
          <img
            src={imageUrl}
            alt=""
            className="max-h-[250px] w-full max-w-[300px] rounded border border-neutral-200 object-contain"
          />
          <button
            type="button"
            className="w-fit text-xs text-neutral-600 underline"
            onClick={() => setImageUrl("")}
          >
            Remove image
          </button>
        </div>
      )}
    </div>
  );
}
