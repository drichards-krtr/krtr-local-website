"use client";

import { useEffect, useRef, useState } from "react";

type MediaLibraryAsset = {
  secure_url?: string;
  url?: string;
  public_id?: string;
  derived?: Array<{
    secure_url?: string;
    url?: string;
  }>;
};

type MediaLibraryHandle = {
  show: (config?: Record<string, unknown>) => void;
  hide: () => void;
};

type CloudinaryConfigResponse = {
  apiKey?: string | null;
  cloudName?: string;
  folder?: string;
  error?: string;
  envPresence?: Record<string, boolean | string | null>;
  invalidCloudinaryUrl?: boolean;
};

type WindowWithCloudinary = Window & {
  cloudinary?: {
    createMediaLibrary: (
      config: Record<string, unknown>,
      callbacks: { insertHandler: (data: { assets?: MediaLibraryAsset[] }) => void }
    ) => MediaLibraryHandle;
  };
};

let mediaLibraryScriptPromise: Promise<void> | null = null;

function loadMediaLibraryScript() {
  if (typeof window === "undefined") return Promise.resolve();
  const cloudinaryWindow = window as WindowWithCloudinary;
  if (cloudinaryWindow.cloudinary?.createMediaLibrary) return Promise.resolve();
  if (mediaLibraryScriptPromise) return mediaLibraryScriptPromise;

  mediaLibraryScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://media-library.cloudinary.com/global/all.js"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load Cloudinary Media Library.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://media-library.cloudinary.com/global/all.js";
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Unable to load Cloudinary Media Library.")), { once: true });
    document.head.appendChild(script);
  });

  return mediaLibraryScriptPromise;
}

async function getCloudinaryConfig() {
  const response = await fetch("/api/cloudinary/signature", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder: "krtr" }),
  });
  const payload = (await response.json().catch(() => null)) as CloudinaryConfigResponse | null;
  if (!response.ok || !payload?.cloudName) {
    const detail = payload?.envPresence
      ? ` Env presence: ${JSON.stringify(payload.envPresence)}${payload.invalidCloudinaryUrl ? " CLOUDINARY_URL is present but invalid." : ""}`
      : "";
    throw new Error(`${payload?.error || "Unable to load Cloudinary configuration."}${detail}`);
  }
  return payload as { apiKey?: string | null; cloudName: string; folder: string };
}

function getAssetUrl(asset: MediaLibraryAsset) {
  const derived = asset.derived?.[0];
  return derived?.secure_url || derived?.url || asset.secure_url || asset.url || "";
}

export default function NrcsCloudinaryImageField({
  initialUrl,
  label,
  name,
}: {
  initialUrl?: string | null;
  label: string;
  name: string;
}) {
  const [url, setUrl] = useState(initialUrl || "");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaLibraryRef = useRef<MediaLibraryHandle | null>(null);
  const configRef = useRef<{ cloudName: string; apiKey?: string | null; folder: string } | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([loadMediaLibraryScript(), getCloudinaryConfig()])
      .then(([, config]) => {
        if (!active) return;
        configRef.current = config;
        setReady(true);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load Cloudinary."));
    return () => {
      active = false;
      mediaLibraryRef.current?.hide();
    };
  }, []);

  function openMediaLibrary() {
    setError(null);
    const cloudinaryWindow = window as WindowWithCloudinary;
    if (!cloudinaryWindow.cloudinary?.createMediaLibrary || !configRef.current) {
      setError("Cloudinary Media Library is not ready.");
      return;
    }

    const widgetConfig: Record<string, unknown> = {
      cloud_name: configRef.current.cloudName,
      multiple: false,
    };
    if (configRef.current.apiKey) widgetConfig.api_key = configRef.current.apiKey;

    if (!mediaLibraryRef.current) {
      mediaLibraryRef.current = cloudinaryWindow.cloudinary.createMediaLibrary(widgetConfig, {
        insertHandler: (data) => {
          const asset = data.assets?.[0] || null;
          const selectedUrl = asset ? getAssetUrl(asset) : "";
          if (!selectedUrl) {
            setError("Selected Cloudinary asset did not include a usable URL.");
            return;
          }
          setUrl(selectedUrl);
        },
      });
    }

    mediaLibraryRef.current.show({
      folder: {
        path: configRef.current.folder,
        resource_type: "image",
      },
      multiple: false,
    });
  }

  return (
    <div className="grid gap-2 text-sm">
      <span className="font-medium">{label}</span>
      <input type="hidden" name={name} value={url} />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={openMediaLibrary}
          disabled={!ready}
          className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold disabled:opacity-60"
        >
          Choose from Cloudinary
        </button>
        {url && (
          <button
            type="button"
            onClick={() => setUrl("")}
            className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold"
          >
            Remove Image
          </button>
        )}
      </div>
      {!ready && !error && <p className="text-xs text-neutral-500">Loading Cloudinary Media Library...</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {url ? (
        <img src={url} alt="" className="max-h-64 w-fit rounded border border-neutral-200 object-contain" />
      ) : (
        <p className="rounded border border-dashed border-neutral-300 p-4 text-xs text-neutral-500">No image selected.</p>
      )}
    </div>
  );
}
