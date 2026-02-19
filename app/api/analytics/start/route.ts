import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  if (!body?.sessionId || !body?.deviceId || !body?.startedAt) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  const { error } = await getSupabaseServer.from("analytics_sessions").insert({
    session_id: String(body.sessionId),
    device_id: String(body.deviceId),
    stream_id: body.streamId ? String(body.streamId) : null,
    started_at: new Date(body.startedAt).toISOString(),
  });

  if (error) {
    return NextResponse.json({ ok: false, error: "db_insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
