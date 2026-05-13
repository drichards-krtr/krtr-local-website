"use client";

import { useEffect, useRef, useState } from "react";

type UploadInfo = {
  secure_url?: string;
  public_id?: string;
  width?: number;
  height?: number;
};

type WidgetResult = {
  event?: string;
  info?: UploadInfo;
};

type WidgetHandle = {
  open: () => void;
  destroy?: () => void;
};

type CloudinaryGlobal = {
  createUploadWidget: (
    options: Record<string, unknown>,
    callback: (error: unknown, result: WidgetResult) => void
  ) => WidgetHandle;
};

type Props = {
  name: string;
  label: string;
  initialUrl?: string | null;
  folder?: string;
  onUpload?: (info: UploadInfo) => void;
  onRemove?: () => void;
};

declare global {
  interface Window {
    cloudinary?: CloudinaryGlobal;
  }
}

let widgetScriptPromise: Promise<void> | null = null;

function loadWidgetScript() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.cloudinary) return Promise.resolve();
  if (widgetScriptPromise) return widgetScriptPromise;

  widgetScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://widget.cloudinary.com/v2.0/global/all.js"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load Cloudinary widget.")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://widget.cloudinary.com/v2.0/global/all.js";
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Unable to load Cloudinary widget.")), {
      once: true,
    });
    document.head.appendChild(script);
  });

  return widgetScriptPromise;
}

async function getWidgetSignature(folder: string) {
  const response = await fetch("/api/cloudinary/signature", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder, source: "upload-widget" }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    throw new Error(payload?.error || "Unable to sign Cloudinary upload.");
  }
  return payload as {
    signature: string;
    timestamp: string;
    apiKey: string;
    cloudName: string;
    params: { folder: string };
  };
}

export default function CloudinaryUploadWidgetField({
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
  const widgetRef = useRef<WidgetHandle | null>(null);
  const cloudNameRef = useRef<string | null>(null);
  const apiKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    loadWidgetScript()
      .then(() => {
        if (active) setReady(true);
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load Cloudinary widget.");
        }
      });

    return () => {
      active = false;
      widgetRef.current?.destroy?.();
      widgetRef.current = null;
    };
  }, []);

  async function openWidget() {
    setOpening(true);
    setError(null);
    try {
      const signed = await getWidgetSignature(folder);
      cloudNameRef.current = signed.cloudName;
      apiKeyRef.current = signed.apiKey;

      if (!window.cloudinary) {
        throw new Error("Cloudinary widget is not ready.");
      }

      widgetRef.current?.destroy?.();
      widgetRef.current = window.cloudinary.createUploadWidget(
        {
          cloudName: signed.cloudName,
          multiple: false,
          prepareUploadParams: async (
            callback: (params: Record<string, unknown>) => void
          ) => {
            try {
              const nextSigned = await getWidgetSignature(folder);
              callback({
                apiKey: nextSigned.apiKey,
                folder: nextSigned.params.folder,
                signature: nextSigned.signature,
                uploadSignatureTimestamp: nextSigned.timestamp,
              });
            } catch (signatureError) {
              setError(
                signatureError instanceof Error
                  ? signatureError.message
                  : "Unable to sign Cloudinary upload."
              );
              callback({ cancel: true });
            }
          },
        },
        (widgetError, result) => {
          if (widgetError) {
            setError(widgetError instanceof Error ? widgetError.message : "Cloudinary upload failed.");
            return;
          }

          if (result.event !== "success" || !result.info) return;
          setImageUrl(result.info.secure_url || "");
          onUpload?.(result.info);
        }
      );

      widgetRef.current.open();
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Unable to open Cloudinary widget.");
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
        onClick={openWidget}
        disabled={!ready || opening}
        className="w-fit rounded border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 disabled:opacity-60"
      >
        {opening ? "Opening..." : imageUrl ? "Replace image" : "Upload image"}
      </button>
      {!ready && !error && <p className="text-xs text-neutral-500">Loading Cloudinary widget...</p>}
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
