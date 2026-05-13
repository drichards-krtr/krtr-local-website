import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/admin";

type MuxWebhookData = {
  id?: string;
  upload_id?: string | null;
  asset_id?: string | null;
  passthrough?: string | null;
  playback_ids?: Array<{ id?: string | null }> | null;
  meta?: {
    external_id?: string | null;
  } | null;
  new_asset_settings?: {
    passthrough?: string | null;
    meta?: {
      external_id?: string | null;
    } | null;
  } | null;
};

function verifyMuxSignature(payload: string, signatureHeader: string | null) {
  const secret = process.env.MUX_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const parts = signatureHeader.split(",");
  const timestampPart = parts.find((part) => part.startsWith("t="));
  const signaturePart = parts.find((part) => part.startsWith("v1="));
  if (!timestampPart || !signaturePart) return false;

  const timestamp = timestampPart.split("=")[1];
  const signature = signaturePart.split("=")[1];
  const signedPayload = `${timestamp}.${payload}`;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  if (expected.length !== signature.length) return false;

  const isValid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  if (!isValid) return false;

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return false;

  return Math.abs(Date.now() / 1000 - sentAt) <= 300;
}

function getStoryIdFromMuxData(data: MuxWebhookData | null | undefined) {
  return (
    data?.passthrough ||
    data?.meta?.external_id ||
    data?.new_asset_settings?.passthrough ||
    data?.new_asset_settings?.meta?.external_id ||
    null
  );
}

async function fetchMuxAsset(assetId: string): Promise<MuxWebhookData | null> {
  const muxToken = process.env.MUX_TOKEN_ID;
  const muxSecret = process.env.MUX_TOKEN_SECRET;
  if (!muxToken || !muxSecret) return null;

  const response = await fetch(`https://api.mux.com/video/v1/assets/${assetId}`, {
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${muxToken}:${muxSecret}`).toString("base64"),
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("[Mux] Failed to retrieve asset during webhook", {
      assetId,
      status: response.status,
      body,
    });
    return null;
  }

  const json = await response.json();
  return (json?.data || null) as MuxWebhookData | null;
}

export async function POST(request: Request) {
  const payload = await request.text();
  const signatureHeader = request.headers.get("mux-signature");

  if (!verifyMuxSignature(payload, signatureHeader)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(payload);
  const eventType = event?.type;
  const data = event?.data as MuxWebhookData | undefined;
  const supabase = createServiceClient();

  async function updateStory(update: Record<string, string | null>, resolvedData = data) {
    const storyId = getStoryIdFromMuxData(resolvedData);
    let query = supabase.from("stories").update(update).select("id");

    if (storyId) {
      query = query.eq("id", storyId);
    } else if (resolvedData?.upload_id) {
      query = query.eq("mux_upload_id", resolvedData.upload_id);
    } else if (resolvedData?.id && eventType === "video.upload.asset_created") {
      query = query.eq("mux_upload_id", resolvedData.id);
    } else if (resolvedData?.id) {
      query = query.eq("mux_asset_id", resolvedData.id);
    } else {
      return;
    }

    const { data: updatedRows, error } = await query;
    if (error) {
      console.error("[Mux] Failed to update story from webhook", {
        eventType,
        update,
        error: error.message,
      });
    } else if (!updatedRows || updatedRows.length === 0) {
      console.error("[Mux] Webhook did not match a story", {
        eventType,
        muxId: resolvedData?.id || null,
        uploadId: resolvedData?.upload_id || resolvedData?.asset_id || null,
        storyId,
      });
    }
  }

  if (eventType === "video.upload.asset_created") {
    await updateStory({
      mux_upload_id: data?.id || null,
      mux_asset_id: data?.asset_id || null,
      mux_status: "processing",
    });
  }

  if (eventType === "video.asset.ready") {
    const asset = data?.id ? (await fetchMuxAsset(data.id)) || data : data;
    const playbackId = asset?.playback_ids?.[0]?.id || null;
    await updateStory({
      mux_upload_id: asset?.upload_id || data?.upload_id || null,
      mux_asset_id: asset?.id || data?.id || null,
      mux_playback_id: playbackId,
      mux_status: playbackId ? "ready" : "processing",
    }, asset);
  }

  if (eventType === "video.asset.errored") {
    await updateStory({
      mux_upload_id: data?.upload_id || null,
      mux_asset_id: data?.id || null,
      mux_status: "errored",
    });
  }

  if (
    eventType === "video.upload.errored" ||
    eventType === "video.upload.cancelled" ||
    eventType === "video.upload.timed_out"
  ) {
    await updateStory({
      mux_upload_id: data?.id || null,
      mux_status: "errored",
    });
  }

  return NextResponse.json({ ok: true });
}
