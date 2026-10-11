import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireNrcsStaff } from "@/lib/auth";
import { uploadGeneratedImage } from "@/lib/cloudinary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await requireNrcsStaff("contributor");
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Choose an image to upload.");
    if (!(["image/png", "image/jpeg", "image/webp"] as string[]).includes(file.type)) throw new Error("Upload a PNG, JPG, or WebP image.");
    if (!file.size || file.size > 4_000_000) throw new Error("Image uploads must be smaller than 4 MB.");

    const title = file.name.replace(/\.[^.]+$/, "").trim().slice(0, 180) || "image";
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "image";
    const uploaded = await uploadGeneratedImage(file, `krtr/uploads/${slug}-${randomUUID()}`, title, file.name);
    return NextResponse.json({
      id: uploaded.publicId,
      public_id: uploaded.publicId,
      secure_url: uploaded.url,
      width: uploaded.width,
      height: uploaded.height,
      format: uploaded.format || null,
      display_name: title,
      filename: file.name,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cloudinary upload failed." }, { status: 400 });
  }
}
