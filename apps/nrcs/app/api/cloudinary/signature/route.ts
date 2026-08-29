import { NextResponse } from "next/server";
import { requireNrcsStaff } from "@/lib/auth";

export async function POST(request: Request) {
  await requireNrcsStaff("contributor");

  const body = await request.json().catch(() => ({}));
  const folder = String(body.folder || "krtr").trim() || "krtr";

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;

  if (!cloudName) {
    return NextResponse.json({ error: "Cloudinary env missing." }, { status: 500 });
  }

  return NextResponse.json({
    apiKey: apiKey || null,
    cloudName,
    folder,
  });
}
