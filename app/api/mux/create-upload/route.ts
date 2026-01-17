import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { storyId } = await request.json().catch(() => ({}));
  if (!storyId) {
    return NextResponse.json({ error: "Missing storyId" }, { status: 400 });
  }

  const muxToken = process.env.MUX_TOKEN_ID;
  const muxSecret = process.env.MUX_TOKEN_SECRET;
  if (!muxToken || !muxSecret) {
    return NextResponse.json({ error: "Mux env missing." }, { status: 500 });
  }

  const res = await fetch("https://api.mux.com/video/v1/uploads", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${muxToken}:${muxSecret}`).toString("base64"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      cors_origin: "*",
      new_asset_settings: {
        playback_policy: ["public"],
        passthrough: storyId,
      },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    return NextResponse.json({ error: errorText }, { status: 500 });
  }

  const json = await res.json();
  const uploadUrl = json?.data?.url;
  const uploadId = json?.data?.id;

  const supabase = createServerSupabase();
  await supabase
    .from("stories")
    .update({ mux_status: "uploading" })
    .eq("id", storyId);

  return NextResponse.json({ uploadUrl, uploadId });
}
