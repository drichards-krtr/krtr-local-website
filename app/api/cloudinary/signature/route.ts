import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder = body.folder || "krtr";

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "Cloudinary env missing." }, { status: 500 });
  }

  const signatureBase = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash("sha1").update(signatureBase).digest("hex");

  return NextResponse.json({
    timestamp,
    signature,
    apiKey,
    cloudName,
  });
}
