import { NextResponse } from "next/server";
import { requireNrcsStaff } from "@/lib/auth";
import { createNrcsServerClient } from "@/lib/server";
import { getMuxAsset, getMuxUpload, muxStatusFromAsset, muxStatusFromUpload, muxThumbnailUrl } from "@/lib/mux";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireNrcsStaff("contributor");
  const { id } = await params;
  const supabase = await createNrcsServerClient();
  const { data: asset, error } = await supabase
    .from("nrcs_assets")
    .select("id, mux_asset_id, mux_upload_id, mux_playback_id, mux_status")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!asset) return NextResponse.json({ error: "Video asset not found." }, { status: 404 });

  let muxAssetId = asset.mux_asset_id as string | null;
  let muxUploadId = asset.mux_upload_id as string | null;
  let muxPlaybackId = asset.mux_playback_id as string | null;
  let muxStatus = (asset.mux_status as string | null) || "none";

  if (muxUploadId && (!muxAssetId || muxStatus !== "ready")) {
    const upload = await getMuxUpload(muxUploadId);
    if (upload?.asset_id) muxAssetId = upload.asset_id;
    muxStatus = muxStatusFromUpload(upload?.status) || muxStatus;
  }

  if (muxAssetId && (muxStatus !== "ready" || !muxPlaybackId)) {
    const muxAsset = await getMuxAsset(muxAssetId);
    if (muxAsset?.id) muxAssetId = muxAsset.id;
    if (muxAsset?.upload_id) muxUploadId = muxAsset.upload_id;
    muxPlaybackId = muxAsset?.playback_ids?.[0]?.id || muxPlaybackId;
    muxStatus = muxStatusFromAsset(muxAsset?.status) || muxStatus;
  }

  const thumbnailUrl = muxThumbnailUrl(muxPlaybackId);
  const { error: updateError } = await supabase
    .from("nrcs_assets")
    .update({
      mux_asset_id: muxAssetId,
      mux_upload_id: muxUploadId,
      mux_playback_id: muxPlaybackId,
      mux_status: muxStatus,
      thumbnail_url: thumbnailUrl,
    })
    .eq("id", id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    assetId: id,
    mux_asset_id: muxAssetId,
    mux_upload_id: muxUploadId,
    mux_playback_id: muxPlaybackId,
    mux_status: muxStatus,
    thumbnail_url: thumbnailUrl,
  });
}
