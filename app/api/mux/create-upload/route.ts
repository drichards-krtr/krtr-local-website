import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveDistrictFromHost } from "@/lib/districts";

export async function POST(request: Request) {
  const districtKey = resolveDistrictFromHost(
    request.headers.get("x-forwarded-host") || request.headers.get("host")
  );
  const { storyId } = await request.json().catch(() => ({}));
  if (!storyId) {
    return NextResponse.json({ error: "Missing storyId" }, { status: 400 });
  }

  const muxToken = process.env.MUX_TOKEN_ID;
  const muxSecret = process.env.MUX_TOKEN_SECRET;
  if (!muxToken || !muxSecret) {
    return NextResponse.json(
      { error: "Mux credentials missing. Set MUX_TOKEN_ID and MUX_TOKEN_SECRET." },
      { status: 500 }
    );
  }

  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host") || null;
  const proto =
    request.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  const corsOrigin =
    request.headers.get("origin") || (host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_SITE_URL || "*");

  let res: Response;
  try {
    res = await fetch("https://api.mux.com/video/v1/uploads", {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${muxToken}:${muxSecret}`).toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cors_origin: corsOrigin,
        new_asset_settings: {
          playback_policy: ["public"],
          passthrough: storyId,
        },
      }),
    });
  } catch (error) {
    console.error("[Mux] Failed to reach Mux create-upload endpoint", error);
    return NextResponse.json(
      { error: "Unable to contact Mux. Check outbound network access from the server." },
      { status: 502 }
    );
  }

  if (!res.ok) {
    const errorText = await res.text();
    console.error("[Mux] Create upload rejected", {
      status: res.status,
      storyId,
      errorText,
    });
    return NextResponse.json(
      {
        error:
          errorText.trim() ||
          `Mux rejected upload creation with status ${res.status}.`,
      },
      { status: 500 }
    );
  }

  const json = await res.json();
  const uploadUrl = json?.data?.url;
  const uploadId = json?.data?.id;
  if (!uploadUrl || !uploadId) {
    console.error("[Mux] Create upload returned incomplete payload", {
      storyId,
      json,
    });
    return NextResponse.json(
      { error: "Mux returned an incomplete upload payload." },
      { status: 502 }
    );
  }

  const supabase = createServiceClient();
  await supabase
    .from("stories")
    .update({ mux_status: "uploading" })
    .eq("district_key", districtKey)
    .eq("id", storyId);

  return NextResponse.json({ uploadUrl, uploadId });
}
