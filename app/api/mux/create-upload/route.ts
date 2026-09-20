import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveDistrictFromHost } from "@/lib/districts";
import { createServerSupabase } from "@/lib/supabase/server";
import { assertLegacyEditorialWrites } from "@/lib/legacyEditorialWrite";

export async function POST(request: Request) {
  const auth = await createServerSupabase();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile, error: profileError } = await auth.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (profileError || !profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { await assertLegacyEditorialWrites(); }
  catch { return NextResponse.json({ error: "Legacy editorial writes are disabled." }, { status: 403 }); }
  const districtKey = resolveDistrictFromHost(
    request.headers.get("x-forwarded-host") || request.headers.get("host")
  );
  const { storyId, dailyId } = await request.json().catch(() => ({}));
  const mediaId = storyId || dailyId;
  const mediaTable = dailyId ? "dailys" : "stories";
  const passthrough = dailyId ? `daily:${dailyId}` : storyId;
  if (!mediaId || storyId && dailyId || typeof mediaId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mediaId)) {
    return NextResponse.json({ error: "Missing storyId or dailyId" }, { status: 400 });
  }
  const service = createServiceClient();
  let target = service.from(mediaTable).select("id").eq("district_key", districtKey).eq("id", mediaId);
  target = dailyId ? target.is("nrcs_edition_id", null) : target.eq("editorial_origin", "cms");
  const { data: media, error: targetError } = await target.maybeSingle();
  if (targetError || !media) return NextResponse.json({ error: "Legacy media target not found in this district." }, { status: 404 });

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
      signal: AbortSignal.timeout(15000),
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
          playback_policies: ["public"],
          passthrough,
          meta: {
            external_id: passthrough,
          },
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
      mediaId,
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
      mediaId,
      json,
    });
    return NextResponse.json(
      { error: "Mux returned an incomplete upload payload." },
      { status: 502 }
    );
  }

  try { await assertLegacyEditorialWrites(); }
  catch { return NextResponse.json({ error: "Editorial authority changed during upload creation; the upload was not attached." }, { status: 409 }); }
  // Use the authenticated client so the database authority guard also covers a cutover race.
  let update = auth
    .from(mediaTable)
    .update({
      mux_upload_id: uploadId,
      mux_asset_id: null,
      mux_playback_id: null,
      mux_status: "uploading",
    })
    .eq("district_key", districtKey)
    .eq("id", mediaId);
  update = dailyId ? update.is("nrcs_edition_id", null) : update.eq("editorial_origin", "cms");
  const { error: updateError, data: updated } = await update.select("id").maybeSingle();

  if (updateError || !updated) {
    console.error("[Mux] Failed to save direct upload", {
      mediaId,
      mediaTable,
      uploadId,
      error: updateError?.message || "Target changed during upload creation",
    });
    return NextResponse.json(
      { error: "Mux upload was created, but the media record could not be updated." },
      { status: 500 }
    );
  }

  return NextResponse.json({ uploadUrl, uploadId });
}
