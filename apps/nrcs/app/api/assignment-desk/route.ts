import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getNrcsSupabaseEnv } from "@/lib/env";
import { createNrcsServerClient } from "@/lib/server";

async function authenticatedClient(request: Request) {
  const authorization = request.headers.get("authorization");
  const { url, anon } = getNrcsSupabaseEnv();
  const db = authorization
    ? createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
    : await createNrcsServerClient();
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (authorization && !token) return null;
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data: staff } = await db.from("nrcs_staff_profiles").select("active").eq("id", user.id).maybeSingle();
  return staff?.active ? db : null;
}

export async function GET(request: Request) {
  const db = await authenticatedClient(request);
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const district = params.get("district") || "";
  const offset = Number(params.get("offset") || 0);
  if (!district || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) {
    return NextResponse.json({ error: "Provide a district and a valid offset." }, { status: 400 });
  }
  const { data: access } = await db.rpc("nrcs_can_access_district", { requested_district_key: district });
  if (!access) return NextResponse.json({ error: "District is unavailable." }, { status: 403 });
  const { data, error } = await db.from("nrcs_assignments")
    .select("id,district_key,title,details,decision,decision_note,owner_id,story_id,radar_id,created_at")
    .eq("district_key", district).order("created_at", { ascending: false }).order("id").range(offset, offset + 49);
  if (error) return NextResponse.json({ error: "Unable to load assignments." }, { status: 500 });
  return NextResponse.json({ assignments: data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const db = await authenticatedClient(request);
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await request.json().catch(() => null);
  const district = typeof payload?.district_key === "string" ? payload.district_key.trim().toLowerCase() : "";
  const title = typeof payload?.title === "string" ? payload.title.trim() : "";
  const details = payload?.details ?? "";
  if (!district || !title || title.length > 500 || typeof details !== "string" || details.length > 24000) {
    return NextResponse.json({ error: "Provide a district, title, and optional pitch details." }, { status: 400 });
  }
  const { data: access } = await db.rpc("nrcs_can_access_district", { requested_district_key: district });
  if (!access) return NextResponse.json({ error: "District is unavailable." }, { status: 403 });
  const { data, error } = await db.from("nrcs_assignments")
    .insert({ district_key: district, title, details: details.trim() }).select("id,decision").single();
  if (error) return NextResponse.json({ error: "Unable to save pitch." }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
