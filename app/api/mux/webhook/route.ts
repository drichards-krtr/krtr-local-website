import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/admin";

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
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function POST(request: Request) {
  const payload = await request.text();
  const signatureHeader = request.headers.get("mux-signature");

  if (!verifyMuxSignature(payload, signatureHeader)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(payload);
  const eventType = event?.type;
  const data = event?.data;
  const passthrough =
    data?.passthrough ?? data?.new_asset_settings?.passthrough ?? null;
  const storyId = extractStoryId(passthrough);

  if (!storyId) {
    console.warn("Mux webhook missing storyId", { eventType, passthrough });
    return NextResponse.json({ ok: true });
  }

  const supabase = createServiceClient();

  if (eventType === "video.upload.asset_created") {
    await supabase
      .from("stories")
      .update({
        mux_asset_id: data?.asset_id || null,
        mux_status: "processing",
      })
      .eq("id", storyId);
  }

  if (eventType === "video.asset.ready") {
    const playbackId = data?.playback_ids?.[0]?.id || null;
    await supabase
      .from("stories")
      .update({
        mux_asset_id: data?.id || null,
        mux_playback_id: playbackId,
        mux_status: "ready",
      })
      .eq("id", storyId);
  }

  if (eventType === "video.asset.errored") {
    await supabase
      .from("stories")
      .update({ mux_status: "errored" })
      .eq("id", storyId);
  }

  return NextResponse.json({ ok: true });
}

function extractStoryId(passthrough: unknown) {
  if (!passthrough) return null;
  if (typeof passthrough === "string") {
    const trimmed = passthrough.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        return typeof parsed?.storyId === "string" ? parsed.storyId : null;
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (typeof passthrough === "object") {
    const obj = passthrough as { storyId?: string };
    return typeof obj.storyId === "string" ? obj.storyId : null;
  }
  return null;
}
