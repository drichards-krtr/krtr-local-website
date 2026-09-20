import { NextResponse } from "next/server";
import { authorizeNrcsService } from "@/lib/nrcsPublication";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function values(rows: Record<string, unknown>[], key: string) {
  return rows.flatMap(row => typeof row[key] === "string" && row[key] ? [row[key] as string] : []);
}

export async function GET(request: Request) {
  if (!authorizeNrcsService(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = createServiceClient();
    const [stories, dailys, events, logos, ads, garageSales] = await Promise.all([
      db.from("stories").select("image_url,cloudinary_public_id,mux_asset_id,article_media"),
      db.from("dailys").select("image_url,cloudinary_public_id,mux_asset_id"),
      db.from("events").select("image_url"),
      db.from("logos").select("image_url"),
      db.from("ads").select("image_url"),
      db.from("garage_sale_submissions").select("image_url"),
    ]);
    const failed = [stories, dailys, events, logos, ads, garageSales].find(result => result.error);
    if (failed?.error) throw new Error(failed.error.message);
    const storyRows = (stories.data || []) as Record<string, unknown>[];
    const media = storyRows.flatMap(row => Array.isArray(row.article_media) ? row.article_media : []).filter(item => item && typeof item === "object") as Record<string, unknown>[];
    const rows = [...storyRows, ...((dailys.data || []) as Record<string, unknown>[]), ...((events.data || []) as Record<string, unknown>[]), ...((logos.data || []) as Record<string, unknown>[]), ...((ads.data || []) as Record<string, unknown>[]), ...((garageSales.data || []) as Record<string, unknown>[])];
    return NextResponse.json({
      ok: true,
      cloudinary_public_ids: [...new Set([...values(rows, "cloudinary_public_id"), ...values(media, "public_id")])],
      cloudinary_urls: [...new Set([...values(rows, "image_url"), ...values(media, "url")])],
      mux_asset_ids: [...new Set(values(rows, "mux_asset_id"))],
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reference export failed." }, { status: 500 });
  }
}
