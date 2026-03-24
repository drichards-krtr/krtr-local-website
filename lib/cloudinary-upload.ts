"use client";

type SignatureResponse = {
  signature: string;
  timestamp: string;
  apiKey: string;
  cloudName: string;
  params: Record<string, string>;
};

type UploadOptions = {
  file: File;
  folder?: string;
  resourceType?: "image" | "video";
};

type CloudinaryUploadResponse = {
  secure_url?: string;
  public_id?: string;
  width?: number;
  height?: number;
  error?: {
    message?: string;
  };
};

async function getSignedUpload(folder: string) {
  const signatureRes = await fetch("/api/cloudinary/signature", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder }),
  });

  const payload = (await signatureRes.json().catch(() => null)) as SignatureResponse | null;
  if (!signatureRes.ok || !payload) {
    throw new Error(payload && "error" in payload ? String((payload as { error?: string }).error) : "Unable to sign Cloudinary upload.");
  }

  return payload;
}

export async function uploadToCloudinary({
  file,
  folder = "krtr",
  resourceType = "image",
}: UploadOptions): Promise<CloudinaryUploadResponse> {
  const { signature, timestamp, apiKey, cloudName, params } = await getSignedUpload(folder);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp);
  formData.append("signature", signature);

  for (const [key, value] of Object.entries(params)) {
    formData.append(key, value);
  }

  const uploadRes = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    {
      method: "POST",
      body: formData,
    }
  );

  const payload = (await uploadRes.json().catch(() => null)) as CloudinaryUploadResponse | null;

  if (!uploadRes.ok) {
    throw new Error(payload?.error?.message || `${resourceType} upload failed.`);
  }

  if (!payload) {
    throw new Error(`Cloudinary returned an empty ${resourceType} upload response.`);
  }

  return payload;
}
