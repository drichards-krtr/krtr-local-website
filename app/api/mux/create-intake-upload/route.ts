import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { externalId } = await request.json().catch(() => ({}));
  const passthrough = `intake:${String(externalId || crypto.randomUUID())}`;

  const muxToken = process.env.MUX_TOKEN_ID;
  const muxSecret = process.env.MUX_TOKEN_SECRET;
  if (!muxToken || !muxSecret) {
    return NextResponse.json(
      { error: "Mux credentials missing. Set MUX_TOKEN_ID and MUX_TOKEN_SECRET." },
      { status: 500 }
    );
  }

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || null;
  const proto = request.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  const corsOrigin =
    request.headers.get("origin") || (host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_SITE_URL || "*");

  let response: Response;
  try {
    response = await fetch("https://api.mux.com/video/v1/uploads", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${muxToken}:${muxSecret}`).toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cors_origin: corsOrigin,
        new_asset_settings: {
          playback_policies: ["public"],
          passthrough,
          meta: {
            external_id: passthrough,
          },
        },
      }),
    });
  } catch (error) {
    console.error("[Mux] Failed to create intake upload", error);
    return NextResponse.json({ error: "Unable to contact Mux." }, { status: 502 });
  }

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json({ error: errorText || "Mux rejected upload creation." }, { status: 500 });
  }

  const json = await response.json();
  const uploadUrl = json?.data?.url;
  const uploadId = json?.data?.id;
  if (!uploadUrl || !uploadId) {
    return NextResponse.json({ error: "Mux returned an incomplete upload payload." }, { status: 502 });
  }

  return NextResponse.json({ uploadUrl, uploadId, passthrough });
}
