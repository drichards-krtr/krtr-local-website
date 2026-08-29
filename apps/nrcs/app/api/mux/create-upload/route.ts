import { NextResponse } from "next/server";
import { requireNrcsStaff } from "@/lib/auth";
import { createNrcsServerClient } from "@/lib/server";
import { muxAuthHeader } from "@/lib/mux";

export async function POST(request: Request) {
  const { profile } = await requireNrcsStaff("contributor");
  const body = await request.json().catch(() => ({}));
  const storyId = String(body.storyId || "").trim();
  const districtKey = String(body.districtKey || "").trim().toLowerCase();
  const title = String(body.title || "Untitled video").trim() || "Untitled video";
  const categoryId = String(body.categoryId || "").trim() || null;
  const tagIds = Array.isArray(body.tagIds)
    ? body.tagIds.map((tagId: unknown) => String(tagId || "").trim()).filter(Boolean)
    : [];

  if (!storyId || !districtKey) {
    return NextResponse.json({ error: "Story and district are required." }, { status: 400 });
  }

  const authorization = muxAuthHeader();
  if (!authorization) {
    return NextResponse.json(
      { error: "Mux credentials missing. Set MUX_TOKEN_ID and MUX_TOKEN_SECRET." },
      { status: 500 }
    );
  }

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || null;
  const proto = request.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  const corsOrigin = request.headers.get("origin") || (host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_NRCS_SITE_URL || "*");

  const supabase = await createNrcsServerClient();
  const { data: asset, error: assetError } = await supabase
    .from("nrcs_assets")
    .insert({
      asset_type: "video",
      title,
      district_key: districtKey,
      category_id: categoryId,
      mux_status: "uploading",
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (assetError || !asset) {
    return NextResponse.json(
      { error: assetError?.message || "Unable to create NRCS video asset." },
      { status: 500 }
    );
  }

  const passthrough = `nrcs_asset:${asset.id}`;
  const response = await fetch("https://api.mux.com/video/v1/uploads", {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      cors_origin: corsOrigin,
      new_asset_settings: {
        playback_policies: ["public"],
        passthrough,
        meta: {
          external_id: passthrough,
          title,
        },
      },
    }),
  }).catch((error) => {
    console.error("[NRCS Mux] Failed to reach create-upload endpoint", error);
    return null;
  });

  if (!response) {
    return NextResponse.json({ error: "Unable to contact Mux." }, { status: 502 });
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    await supabase.from("nrcs_assets").update({ mux_status: "errored" }).eq("id", asset.id);
    return NextResponse.json(
      { error: detail.trim() || `Mux rejected upload creation with status ${response.status}.` },
      { status: 500 }
    );
  }

  const json = await response.json();
  const uploadUrl = json?.data?.url;
  const uploadId = json?.data?.id;
  if (!uploadUrl || !uploadId) {
    await supabase.from("nrcs_assets").update({ mux_status: "errored" }).eq("id", asset.id);
    return NextResponse.json({ error: "Mux returned an incomplete upload payload." }, { status: 502 });
  }

  const { error: updateError } = await supabase
    .from("nrcs_assets")
    .update({ mux_upload_id: uploadId, mux_status: "uploading" })
    .eq("id", asset.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Mux upload was created, but the NRCS asset could not be updated." },
      { status: 500 }
    );
  }

  await supabase.from("nrcs_story_assets").insert({
    story_id: storyId,
    asset_id: asset.id,
    relationship: "video",
  });

  if (tagIds.length) {
    await supabase.from("nrcs_asset_tags").insert(
      tagIds.map((tagId: string) => ({
        asset_id: asset.id,
        tag_id: tagId,
      }))
    );
  }

  return NextResponse.json({ uploadUrl, uploadId, assetId: asset.id });
}
