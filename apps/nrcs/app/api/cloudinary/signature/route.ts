import { NextResponse } from "next/server";
import { requireNrcsStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

function readCloudinaryUrl() {
  const value = process.env.CLOUDINARY_URL?.trim();
  if (!value) return {};

  try {
    const parsed = new URL(value);
    return {
      cloudName: parsed.hostname || undefined,
      apiKey: parsed.username || undefined,
    };
  } catch {
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

  const cloudName = (
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
    cloudinaryUrl.cloudName ||
    ""
  ).trim();
  const apiKey = (
    process.env.CLOUDINARY_API_KEY ||
    process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY ||
    cloudinaryUrl.apiKey ||
    ""
  ).trim();

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
    folder,
  });
}
