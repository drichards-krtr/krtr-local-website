"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StorySubmissionForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [tease, setTease] = useState("");
  const [bodyMarkdown, setBodyMarkdown] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [submitterPhone, setSubmitterPhone] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadImage(file: File) {
    setStatus("Uploading image...");
    setError(null);

    const signatureRes = await fetch("/api/cloudinary/signature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: "krtr/stories" }),
    });
    if (!signatureRes.ok) {
      throw new Error("Unable to sign Cloudinary upload.");
    }

    const { signature, timestamp, apiKey, cloudName } = await signatureRes.json();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("api_key", apiKey);
    formData.append("timestamp", timestamp);
    formData.append("signature", signature);
    formData.append("folder", "krtr/stories");

    const uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: "POST",
        body: formData,
      }
    );
    if (!uploadRes.ok) {
      throw new Error("Image upload failed.");
    }
    const payload = await uploadRes.json();
    setImageUrl(payload.secure_url || "");
    setStatus("Image upload complete.");
  }

  async function uploadVideo(storyId: string, file: File) {
    setStatus("Uploading video...");
    const response = await fetch("/api/mux/create-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storyId }),
    });
    if (!response.ok) {
      throw new Error("Unable to create Mux upload.");
    }

    const { uploadUrl } = await response.json();
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
    });
    if (!uploadRes.ok) {
      throw new Error("Video upload failed.");
    }
    setStatus("Video uploaded. Processing will continue in the background.");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setStatus("Submitting...");
    try {
      const response = await fetch("/api/story-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          tease,
          body_markdown: bodyMarkdown,
          image_url: imageUrl || null,
          submitter_name: submitterName,
          submitter_phone: submitterPhone,
          submitter_email: submitterEmail,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.storyId) {
        throw new Error(payload?.error || "Unable to submit story.");
      }

      if (videoFile) {
        await uploadVideo(payload.storyId, videoFile);
      }

      router.push("/submit-story/thanks");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Submission failed."
      );
      setStatus(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-2">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Story title"
        required
        className="rounded border border-neutral-300 px-3 py-2 text-sm"
      />
      <input
        value={tease}
        onChange={(event) => setTease(event.target.value)}
        placeholder="Short summary (optional)"
        className="rounded border border-neutral-300 px-3 py-2 text-sm"
      />
      <textarea
        value={bodyMarkdown}
        onChange={(event) => setBodyMarkdown(event.target.value)}
        placeholder="Story details"
        required
        className="min-h-[140px] rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2"
      />

      <div className="md:col-span-2 rounded border border-neutral-200 bg-neutral-50 p-3">
        <h2 className="text-sm font-semibold">Contact Information</h2>
        <p className="mb-3 text-xs text-neutral-600">
          Our team may contact you with questions before publishing.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <input
            value={submitterName}
            onChange={(event) => setSubmitterName(event.target.value)}
            placeholder="Your name"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            value={submitterPhone}
            onChange={(event) => setSubmitterPhone(event.target.value)}
            placeholder="Phone"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            value={submitterEmail}
            onChange={(event) => setSubmitterEmail(event.target.value)}
            type="email"
            placeholder="Email"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium">Image (optional)</label>
        <input
          type="file"
          accept="image/*"
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
          disabled={submitting}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
              await uploadImage(file);
            } catch (uploadError) {
              setError(
                uploadError instanceof Error ? uploadError.message : "Image upload failed."
              );
              setStatus(null);
            }
          }}
        />
        {imageUrl && (
          <img
            src={imageUrl}
            alt=""
            className="max-h-[250px] max-w-[300px] rounded border border-neutral-200 object-contain"
          />
        )}
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium">Video (optional)</label>
        <input
          type="file"
          accept="video/*"
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
          disabled={submitting}
          onChange={(event) => setVideoFile(event.target.files?.[0] || null)}
        />
        <p className="text-xs text-neutral-600">
          If included, the video will upload to Mux after story submission.
        </p>
      </div>

      <div className="md:col-span-2">
        <p className="mb-2 text-xs text-neutral-600">
          Submission status is automatically set to draft.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting ? "Submitting..." : "Submit Story"}
        </button>
      </div>

      {status && <p className="text-xs text-neutral-600 md:col-span-2">{status}</p>}
      {error && <p className="text-xs text-red-600 md:col-span-2">{error}</p>}
    </form>
  );
}
