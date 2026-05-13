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

type MediaLibraryData = {
  assets?: MediaLibraryAsset[];
};

type MediaLibraryHandle = {
  show: (config?: Record<string, unknown>) => void;
  hide: () => void;
};

type CloudinaryGlobal = {
  createMediaLibrary: (
    config: Record<string, unknown>,
    callbacks: {
      insertHandler: (data: MediaLibraryData) => void;
    }
  ) => MediaLibraryHandle;
};

type Props = {
  name: string;
  label: string;
  initialUrl?: string | null;
  folder?: string;
  onUpload?: (info: MediaLibraryAsset) => void;
  onRemove?: () => void;
};

declare global {
  interface Window {
    cloudinary?: CloudinaryGlobal;
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
      existing.addEventListener(
        "error",
        () => reject(new Error("Unable to load Cloudinary Media Library.")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = "https://media-library.cloudinary.com/global/all.js";
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Unable to load Cloudinary Media Library.")),
      { once: true }
    );
    document.head.appendChild(script);
  });

  return mediaLibraryScriptPromise;
}

async function getCloudinaryConfig() {
  const response = await fetch("/api/cloudinary/signature", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder: "krtr" }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    throw new Error(payload?.error || "Unable to load Cloudinary configuration.");
  }
  return payload as {
    apiKey: string;
    cloudName: string;
  };
}

function getAssetUrl(asset: MediaLibraryAsset) {
  const derived = asset.derived?.[0];
  return derived?.secure_url || derived?.url || asset.secure_url || asset.url || "";
}

function getAssetWidth(asset: MediaLibraryAsset) {
  return asset.derived?.[0]?.width || asset.width;
}

function getAssetHeight(asset: MediaLibraryAsset) {
  return asset.derived?.[0]?.height || asset.height;
}

export default function CloudinaryMediaLibraryField({
  name,
  label,
  initialUrl = null,
  folder = "krtr",
  onUpload,
  onRemove,
}: Props) {
  const [imageUrl, setImageUrl] = useState(initialUrl || "");
  const [ready, setReady] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaLibraryRef = useRef<MediaLibraryHandle | null>(null);
  const configRef = useRef<{ cloudName: string; apiKey: string } | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([loadMediaLibraryScript(), getCloudinaryConfig()])
      .then(([, config]) => {
        if (!active) return;
        configRef.current = config;
        setReady(true);
      })
      .catch((loadError) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load Cloudinary Media Library."
          );
        }
      });

    return () => {
      active = false;
      mediaLibraryRef.current?.hide();
      mediaLibraryRef.current = null;
    };
  }, []);

  function ensureMediaLibrary() {
    if (mediaLibraryRef.current) return mediaLibraryRef.current;
    if (!window.cloudinary?.createMediaLibrary || !configRef.current) {
      throw new Error("Cloudinary Media Library is not ready.");
    }

    mediaLibraryRef.current = window.cloudinary.createMediaLibrary(
      {
        cloud_name: configRef.current.cloudName,
        api_key: configRef.current.apiKey,
        multiple: false,
      },
      {
        insertHandler: (data) => {
          const asset = data.assets?.[0];
          if (!asset) return;

          const nextUrl = getAssetUrl(asset);
          if (!nextUrl) {
            setError("Selected Cloudinary asset did not include a usable URL.");
            return;
          }

          setImageUrl(nextUrl);
          onUpload?.({
            ...asset,
            secure_url: nextUrl,
            width: getAssetWidth(asset),
            height: getAssetHeight(asset),
          });
        },
      }
    );

    return mediaLibraryRef.current;
  }

  function openMediaLibrary() {
    setOpening(true);
    setError(null);
    try {
      ensureMediaLibrary().show({
        folder: {
          path: folder,
          resource_type: "image",
        },
        multiple: false,
      });
    } catch (openError) {
      setError(
        openError instanceof Error
          ? openError.message
          : "Unable to open Cloudinary Media Library."
      );
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-2">
      <label className="text-sm font-medium">{label}</label>
      <input type="hidden" name={name} value={imageUrl} onChange={() => {}} />
      <button
        type="button"
        onClick={openMediaLibrary}
        disabled={!ready || opening}
        className="w-fit rounded border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 disabled:opacity-60"
      >
        {opening ? "Opening..." : imageUrl ? "Choose different image" : "Choose image"}
      </button>
      {!ready && !error && (
        <p className="text-xs text-neutral-500">Loading Cloudinary Media Library...</p>
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
            onClick={() => {
              setImageUrl("");
              onRemove?.();
            }}
          >
            Remove image
          </button>
        </div>
      )}
    </div>
  );
}
