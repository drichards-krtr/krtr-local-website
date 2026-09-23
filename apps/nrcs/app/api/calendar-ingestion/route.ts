import { NextResponse } from "next/server";
import { integrationAuthorized, readLimitedJson, validateCalendarRun, hashJson } from "@/lib/calendarIngestion";
import { createNrcsServiceClient } from "@/lib/server";
import { getCmsDistricts } from "@/lib/cmsDistricts";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!integrationAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let run;
  try { run = validateCalendarRun(await readLimitedJson(request)); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid payload" }, { status: 400 }); }
  const db = createNrcsServiceClient();
  const { data: source, error } = await db.from("nrcs_calendar_sources").select("district_key, enabled").eq("id", run.source_id).maybeSingle();
  if (error) return NextResponse.json({ error: "Source registry unavailable" }, { status: 503 });
  if (!source?.enabled) return NextResponse.json({ error: "Source disabled or missing" }, { status: 409 });
  const districts = await getCmsDistricts();
  if (!districts) return NextResponse.json({ error: "Cannot verify authoritative district configuration; retry later" }, { status: 503 });
  if (!districts.some(d => d.district_key === source.district_key && d.enabled)) return NextResponse.json({ error: "District disabled or missing" }, { status: 409 });
  const result = await db.rpc("nrcs_receive_calendar_run", { p_run: run, p_hash: hashJson(run) });
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 409 });
  return NextResponse.json({ ok: true, ...result.data }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  if (!integrationAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const districts = await getCmsDistricts();
  if (!districts) return NextResponse.json({ error: "District configuration unavailable" }, { status: 503 });
  const enabled = districts.filter(d => d.enabled).map(d => d.district_key);
  if (!enabled.length) return NextResponse.json({ sources: [] });
  const { data, error } = await createNrcsServiceClient().from("nrcs_calendar_sources")
    .select("id,district_key,name,adapter_type,url,feed_url,provider,extraction_notes")
    .eq("enabled", true).in("district_key", enabled).order("id").limit(1001);
  if (error || (data?.length || 0) > 1000) return NextResponse.json({ error: "Registry unavailable or exceeds Phase A source limit" }, { status: 503 });
  return NextResponse.json({ sources: data, horizon_days: 90 }, { headers: { "Cache-Control": "no-store" } });
}
