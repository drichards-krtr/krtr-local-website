import { NextResponse } from "next/server";
import { requireNrcsStaff } from "@/lib/auth";
import { createNrcsServerClient } from "@/lib/server";
import { muxThumbnailUrl } from "@/lib/mux";

export async function GET(request: Request) {
  await requireNrcsStaff("contributor");
  const url = new URL(request.url);
  const districtKey = String(url.searchParams.get("district") || "").trim().toLowerCase();
  const allDistricts = url.searchParams.get("allDistricts") === "1";
  const search = String(url.searchParams.get("search") || "").trim();
  const categoryId = String(url.searchParams.get("category") || "").trim();
  const tagId = String(url.searchParams.get("tag") || "").trim();

  const supabase = await createNrcsServerClient();
  let query = supabase
    .from("nrcs_assets")
    .select("id, title, district_key, category_id, mux_asset_id, mux_upload_id, mux_playback_id, mux_status, thumbnail_url, created_at, nrcs_categories(name), nrcs_asset_tags(tag_id)")
    .eq("asset_type", "video")
    .order("created_at", { ascending: false })
    .limit(50);

  if (!allDistricts && districtKey) query = query.eq("district_key", districtKey);
  if (categoryId) query = query.eq("category_id", categoryId);
  if (search) query = query.ilike("title", `%${search}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const videos = (data || [])
    .filter((asset) => !tagId || (asset.nrcs_asset_tags || []).some((tag: { tag_id: string }) => tag.tag_id === tagId))
    .map((asset) => {
      const category = Array.isArray(asset.nrcs_categories)
        ? (asset.nrcs_categories[0] as { name?: string } | undefined)
        : (asset.nrcs_categories as { name?: string } | null);

      return {
      id: asset.id,
      title: asset.title,
      district_key: asset.district_key,
      category_id: asset.category_id,
      category_name: category?.name || null,
      mux_asset_id: asset.mux_asset_id,
      mux_upload_id: asset.mux_upload_id,
      mux_playback_id: asset.mux_playback_id,
      mux_status: asset.mux_status || "none",
      thumbnail_url: asset.thumbnail_url || muxThumbnailUrl(asset.mux_playback_id),
      selectable: asset.mux_status === "ready" && Boolean(asset.mux_playback_id),
      };
    });

  return NextResponse.json({ ok: true, videos });
}
