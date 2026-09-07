import { NextResponse } from "next/server";
import { createNrcsServiceClient } from "@/lib/server";

type IntakePayload = {
  intake_type: "story_tip" | "calendar_submission";
  district_key: string;
  title: string;
  summary?: string | null;
  body?: string | null;
  submitter_name?: string | null;
  submitter_email?: string | null;
  submitter_phone?: string | null;
  payload?: Record<string, unknown>;
  source_system?: string | null;
  external_source_id?: string | null;
};

function isAuthorized(request: Request) {
  const expected = process.env.NRCS_CMS_API_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(expected && supplied && supplied === expected);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as IntakePayload | null;
  if (!payload?.intake_type || !payload.district_key || !payload.title) {
    return NextResponse.json({ error: "Missing required intake fields" }, { status: 400 });
  }

  const service = createNrcsServiceClient();
  const write = {
    intake_type: payload.intake_type,
    district_key: payload.district_key.toLowerCase(),
    title: payload.title.trim(),
    summary: payload.summary || null,
    body: payload.body || null,
    submitter_name: payload.submitter_name || null,
    submitter_email: payload.submitter_email || null,
    submitter_phone: payload.submitter_phone || null,
    payload: payload.payload || {},
    source_system: payload.source_system || "cms_public",
    external_source_id: payload.external_source_id || null,
  };

  const query = service
    .from("nrcs_intake_items")
    .upsert(write, { onConflict: "source_system,external_source_id" })
    .select("id, intake_type, district_key, status")
    .single();
  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    table: "nrcs_intake_items",
    intake_id: data.id,
    intake_type: data.intake_type,
    district_key: data.district_key,
    status: data.status,
    nrcs_supabase_host: process.env.NEXT_PUBLIC_NRCS_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_NRCS_SUPABASE_URL).host
      : null,
  });
}
