import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic"; // helps prevent build-time evaluation edge cases

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  if (!body?.sessionId || !body?.deviceId || !body?.endedAt) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  const endedAtISO = new Date(body.endedAt).toISOString();

  // Create the client lazily (runtime), not at import/build time
  const supabaseServer = getSupabaseServer();

  // Fetch started_at so we can compute duration server-side
  const { data: existing, error: readErr } = await supabaseServer
    .from("analytics_sessions")
    .select("started_at")
    .eq("session_id", String(body.sessionId))
    .maybeSingle();

  if (readErr || !existing?.started_at) {
    return NextResponse.json({ ok: false, error: "session_not_found" }, { status: 404 });
  }

  const startedMs = new Date(existing.started_at).getTime();
  const endedMs = new Date(endedAtISO).getTime();
  const durationSeconds = Math.max(0, Math.floor((endedMs - startedMs) / 1000));

  const { error: updateErr } = await supabaseServer
    .from("analytics_sessions")
    .update({
      ended_at: endedAtISO,
      duration_seconds: durationSeconds,
    })
    .eq("session_id", String(body.sessionId))
    .eq("device_id", String(body.deviceId));

  if (updateErr) {
    return NextResponse.json({ ok: false, error: "db_update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
