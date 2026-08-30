import { NextResponse } from "next/server";
import { requireNrcsStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

function cleanEnvValue(value: string | undefined) {
  return (value || "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^\[|\]$/g, "")
    .trim();
}

function readCloudinaryUrl() {
  let value = cleanEnvValue(process.env.CLOUDINARY_URL);
  if (!value) return {};

  value = value.replace(/^CLOUDINARY_URL\s*=\s*/i, "").trim();

  const plainCloudName = value.match(/^[a-zA-Z0-9_-]+$/);
  if (plainCloudName) {
    return { cloudName: value, source: "CLOUDINARY_URL plain value" };
  }

  try {
    const parsed = new URL(value);
    if (parsed.hostname === "res.cloudinary.com") {
      const cloudName = parsed.pathname.split("/").filter(Boolean)[0];
      return {
        cloudName,
        apiKey: undefined,
        source: "CLOUDINARY_URL delivery URL",
      };
    }

    return {
      cloudName: parsed.hostname || undefined,
      apiKey: parsed.username || undefined,
      source: "CLOUDINARY_URL",
    };
  } catch {
    const cloudNameFromAtFormat = value.match(/@([^/?#]+)/)?.[1];
    if (cloudNameFromAtFormat) {
      return { cloudName: cloudNameFromAtFormat, source: "CLOUDINARY_URL @ fallback" };
    }

    return { invalidCloudinaryUrl: true };
  }
}

function cloudinaryEnvPresence() {
  return {
    CLOUDINARY_CLOUD_NAME: Boolean(process.env.CLOUDINARY_CLOUD_NAME?.trim()),
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: Boolean(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim()),
    CLOUDINARY_URL: Boolean(process.env.CLOUDINARY_URL?.trim()),
    CLOUDINARY_API_KEY: Boolean(process.env.CLOUDINARY_API_KEY?.trim()),
    NEXT_PUBLIC_CLOUDINARY_API_KEY: Boolean(process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY?.trim()),
    VERCEL_ENV: process.env.VERCEL_ENV || null,
  };
}

export async function POST(request: Request) {
  await requireNrcsStaff("contributor");

  const body = await request.json().catch(() => ({}));
  const folder = String(body.folder || "krtr").trim() || "krtr";
  const cloudinaryUrl = readCloudinaryUrl();

  const directCloudName = cleanEnvValue(process.env.CLOUDINARY_CLOUD_NAME);
  const publicCloudName = cleanEnvValue(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME);
  const cloudName = directCloudName || publicCloudName || cleanEnvValue(cloudinaryUrl.cloudName);
  const cloudNameSource =
    (directCloudName && "CLOUDINARY_CLOUD_NAME") ||
    (publicCloudName && "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME") ||
    cloudinaryUrl.source ||
    null;
  const apiKey =
    cleanEnvValue(process.env.CLOUDINARY_API_KEY) ||
    cleanEnvValue(process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY) ||
    cleanEnvValue(cloudinaryUrl.apiKey);

  if (!cloudName) {
    return NextResponse.json(
      {
        error:
          "Cloudinary env missing. Set CLOUDINARY_CLOUD_NAME on the NRCS Vercel project and redeploy.",
        missing: ["CLOUDINARY_CLOUD_NAME"],
        envPresence: cloudinaryEnvPresence(),
        invalidCloudinaryUrl: Boolean(cloudinaryUrl.invalidCloudinaryUrl),
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    apiKey: apiKey || null,
    cloudName,
    cloudNameSource,
    folder,
  });
}
