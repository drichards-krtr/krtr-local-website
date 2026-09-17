import "server-only";
import { createHash } from "node:crypto";

function clean(value: string | undefined) {
  return (value || "").trim().replace(/^[\"'`]+|[\"'`]+$/g, "").replace(/^CLOUDINARY_\w+\s*=\s*/i, "");
}
export function getCloudinaryCredentials() {
  let parsed: URL | null = null;
  for (const value of [process.env.CLOUDINARY_URL, process.env.CLOUDINARY_CLOUD_NAME]) {
    try {
      const url = new URL(clean(value));
      if (url.protocol === "cloudinary:") { parsed = url; break; }
    } catch { /* Plain cloud names are also supported. */ }
  }
  const direct = clean(process.env.CLOUDINARY_CLOUD_NAME);
  const cloudName = /^[a-zA-Z0-9_-]+$/.test(direct) ? direct : parsed?.hostname || clean(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME);
  const apiKey = clean(process.env.CLOUDINARY_API_KEY) || (parsed ? decodeURIComponent(parsed.username) : "");
  const apiSecret = clean(process.env.CLOUDINARY_API_SECRET) || (parsed ? decodeURIComponent(parsed.password) : "");
  if (!cloudName || !apiKey || !apiSecret || !/^[a-zA-Z0-9_-]+$/.test(cloudName)) {
    throw new Error("Signed uploads require CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET on the NRCS Vercel project (or a valid CLOUDINARY_URL).");
  }
  return { cloudName, apiKey, apiSecret };
}
export function signCloudinaryParameters(parameters: Record<string, string>, secret: string) {
  return createHash("sha256").update(Object.keys(parameters).sort().map(key => `${key}=${parameters[key]}`).join("&") + secret).digest("hex");
}
export async function uploadGeneratedImage(file: Blob, publicId: string) {
  const { cloudName, apiKey, apiSecret } = getCloudinaryCredentials();
  const parameters = { public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)), overwrite: "false" };
  const body = new FormData();
  for (const [key, value] of Object.entries(parameters)) body.set(key, value);
  body.set("file", file, "graphic.png");
  body.set("api_key", apiKey);
  body.set("signature", signCloudinaryParameters(parameters, apiSecret));
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST", body, signal: AbortSignal.timeout(25000),
  });
  const payload = await response.json();
  if (!response.ok || !payload.public_id || !payload.secure_url) {
    throw new Error(payload.error?.message || "Cloudinary upload failed.");
  }
  return { publicId: payload.public_id as string, url: payload.secure_url as string, width: payload.width as number, height: payload.height as number };
}
