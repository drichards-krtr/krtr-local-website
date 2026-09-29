import { NextResponse } from "next/server";
import { requireNrcsStaff } from "@/lib/auth";
import { getCloudinaryCredentials } from "@/lib/cloudinary";

export const dynamic = "force-dynamic";

type CloudinaryResource = {
  asset_id?: string;
  public_id?: string;
  secure_url?: string;
  width?: number;
  height?: number;
  format?: string;
  created_at?: string;
  display_name?: string;
  filename?: string;
};

function searchTerms(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9/_ -]/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 5);
}

export async function GET(request: Request) {
  await requireNrcsStaff("contributor");
  try {
    const { cloudName, apiKey, apiSecret } = getCloudinaryCredentials();
    const params = new URL(request.url).searchParams;
    const terms = searchTerms(params.get("q") || "");
    const cursor = (params.get("cursor") || "").trim();
    const expression = ["resource_type:image", "public_id:krtr/*", ...terms.map((term) => `(public_id:*${term}* OR filename:*${term}* OR display_name:*${term}*)`)].join(" AND ");
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/resources/search`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expression, max_results: 30, next_cursor: cursor || undefined, sort_by: [{ created_at: "desc" }] }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json().catch(() => null) as { resources?: CloudinaryResource[]; next_cursor?: string; error?: { message?: string } } | null;
    if (!response.ok || !payload) throw new Error(payload?.error?.message || "Cloudinary library search failed.");
    return NextResponse.json({
      assets: (payload.resources || []).flatMap((asset) => asset.public_id && asset.secure_url ? [{
        id: asset.asset_id || asset.public_id,
        public_id: asset.public_id,
        secure_url: asset.secure_url,
        width: asset.width || null,
        height: asset.height || null,
        format: asset.format || null,
        created_at: asset.created_at || null,
        display_name: asset.display_name || null,
        filename: asset.filename || null,
      }] : []),
      nextCursor: payload.next_cursor || null,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cloudinary library search failed." }, { status: 500 });
  }
}
