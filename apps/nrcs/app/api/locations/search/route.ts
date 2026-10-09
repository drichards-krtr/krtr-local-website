import { NextResponse } from "next/server";
import { requireNrcsStaff } from "@/lib/auth";
import { createNrcsServerClient } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireNrcsStaff("contributor");
  const params = new URL(request.url).searchParams;
  const district = (params.get("district") || "").trim().toLowerCase();
  const q = (params.get("q") || "").trim().replace(/[%_,()]/g, " ").replace(/\s+/g, " ").slice(0, 100);
  if (!district || q.length < 2) return NextResponse.json({ results: [] });

  const supabase = await createNrcsServerClient();
  const { data, error } = await supabase
    .from("nrcs_locations")
    .select("id, name, address, city, state, zip")
    .eq("district_key", district)
    .ilike("name", `%${q}%`)
    .order("name")
    .limit(8);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data || [] }, { headers: { "Cache-Control": "private, no-store" } });
}
