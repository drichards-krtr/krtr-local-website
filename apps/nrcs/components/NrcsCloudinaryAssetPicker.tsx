"use client";

import { useEffect, useRef, useState } from "react";

type MediaLibraryAsset = {
  secure_url?: string;
  url?: string;
  public_id?: string;
  width?: number;
  height?: number;
  derived?: Array<{
    secure_url?: string;
    url?: string;
    width?: number;
    height?: number;
  }>;
};

type MediaLibraryHandle = {
  show: (config?: Record<string, unknown>) => void;
  hide: () => void;
};

declare global {
  interface Window {
    cloudinary?: {
      createMediaLibrary: (
        config: Record<string, unknown>,
        callbacks: { insertHandler: (data: { assets?: MediaLibraryAsset[] }) => void }
      ) => MediaLibraryHandle;
    };
  }
}

let mediaLibraryScriptPromise: Promise<void> | null = null;

function loadMediaLibraryScript() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.cloudinary?.createMediaLibrary) return Promise.resolve();
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
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new Error(payload?.error || "Unable to load Cloudinary configuration.");
  return payload as { apiKey?: string | null; cloudName: string; folder: string };
}

function getAssetUrl(asset: MediaLibraryAsset) {
  const derived = asset.derived?.[0];
  return derived?.secure_url || derived?.url || asset.secure_url || asset.url || "";
}

export default function NrcsCloudinaryAssetPicker({
  action,
  storyId,
  districtKey,
  categoryId,
  label = "Choose Image/Graphic",
}: {
  action: (formData: FormData) => Promise<void>;
  storyId: string;
  districtKey: string;
  categoryId?: string | null;
  label?: string;
}) {
  const [selected, setSelected] = useState<MediaLibraryAsset | null>(null);
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
    if (!window.cloudinary?.createMediaLibrary || !configRef.current) {
      setError("Cloudinary Media Library is not ready.");
      return;
    }

    const widgetConfig: Record<string, unknown> = {
      cloud_name: configRef.current.cloudName,
      multiple: false,
    };
    if (configRef.current.apiKey) widgetConfig.api_key = configRef.current.apiKey;

    if (!mediaLibraryRef.current) {
      mediaLibraryRef.current = window.cloudinary.createMediaLibrary(
        widgetConfig,
        {
          insertHandler: (data) => {
            const asset = data.assets?.[0] || null;
            if (!asset || !getAssetUrl(asset)) {
              setError("Selected Cloudinary asset did not include a usable URL.");
              return;
            }
            setSelected(asset);
          },
        }
      );
    }

    mediaLibraryRef.current.show({
      folder: {
        path: configRef.current.folder,
        resource_type: "image",
      },
      multiple: false,
    });
  }

  const url = selected ? getAssetUrl(selected) : "";

  return (
    <form action={action} className="grid gap-3 rounded border border-neutral-200 p-4">
      <input type="hidden" name="story_id" value={storyId} />
      <input type="hidden" name="district_key" value={districtKey} />
      <input type="hidden" name="category_id" value={categoryId || ""} />
      <input type="hidden" name="asset_type" value="image" />
      <input type="hidden" name="cloudinary_url" value={url} />
      <input type="hidden" name="cloudinary_public_id" value={selected?.public_id || ""} />
      <input type="hidden" name="title" value={selected?.public_id || "Cloudinary image"} />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={openMediaLibrary}
          disabled={!ready}
          className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {label}
        </button>
        <button
          disabled={!url}
          className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Attach Selected
        </button>
      </div>
      {!ready && !error && <p className="text-xs text-neutral-500">Loading Cloudinary Media Library...</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {url && <img src={url} alt="" className="max-h-48 w-fit rounded border border-neutral-200 object-contain" />}
    </form>
  );
}
