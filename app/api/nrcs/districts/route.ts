import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

function isAuthorized(request: Request) {
  const expected = process.env.CMS_NRCS_API_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(expected && supplied && supplied === expected);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("districts")
    .select(
      "district_key, subdomain, display_name, enabled, primary_contact_name, primary_contact_email, primary_contact_phone"
    )
    .order("display_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    districts: data || [],
    cms_supabase_host: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
      : null,
  });
}
