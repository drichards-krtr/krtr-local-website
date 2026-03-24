import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder = String(body.folder || "krtr").trim() || "krtr";

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "Cloudinary env missing." }, { status: 500 });
  }

  const params = {
    asset_folder: folder,
    folder,
  };

  const signatureBase =
    Object.entries({ ...params, timestamp })
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join("&") + apiSecret;

  const signature = crypto.createHash("sha1").update(signatureBase).digest("hex");

  return NextResponse.json({
    timestamp,
    signature,
    apiKey,
    cloudName,
    params,
  });
}
