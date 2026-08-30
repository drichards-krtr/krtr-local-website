import { NextResponse } from "next/server";
import { requireNrcsStaff } from "@/lib/auth";

function readCloudinaryUrl() {
  const value = process.env.CLOUDINARY_URL;
  if (!value) return {};

  try {
    const parsed = new URL(value);
    return {
      cloudName: parsed.hostname || undefined,
      apiKey: parsed.username || undefined,
    };
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  await requireNrcsStaff("contributor");

  const body = await request.json().catch(() => ({}));
  const folder = String(body.folder || "krtr").trim() || "krtr";
  const cloudinaryUrl = readCloudinaryUrl();

  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
    cloudinaryUrl.cloudName;
  const apiKey =
    process.env.CLOUDINARY_API_KEY ||
    process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY ||
    cloudinaryUrl.apiKey;

  if (!cloudName) {
    return NextResponse.json(
      {
        error:
          "Cloudinary env missing. Set CLOUDINARY_CLOUD_NAME on the NRCS Vercel project and redeploy.",
        missing: ["CLOUDINARY_CLOUD_NAME"],
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
