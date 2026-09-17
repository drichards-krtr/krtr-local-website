import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { authorizeNrcsService, sanitizePublicationHtml } from "@/lib/nrcsPublication";
import sanitizeHtml from "sanitize-html";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!authorizeNrcsService(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 1000000) throw new Error("Event exceeds size limit.");
    const payload = JSON.parse(raw);
    if (!payload || !/^[0-9a-f-]{36}$/i.test(payload.id) || !/^[a-z0-9][a-z0-9-]*$/.test(payload.district_key) || typeof payload.title !== "string" || !payload.title.trim() || !Number.isFinite(Date.parse(payload.start_at)) || !["draft", "published", "archived"].includes(payload.status)) throw new Error("Invalid required event fields.");
    if (payload.classification && (!["sport", "extra_curricular", "event_type"].includes(payload.classification.kind) || typeof payload.classification.name !== "string" || !payload.classification.name.trim() || typeof payload.classification.enabled !== "boolean")) throw new Error("Invalid event classification.");
    if (payload.body_html !== null && typeof payload.body_html !== "string") throw new Error("Invalid event description.");
    const bodyHtml = payload.body_html ? sanitizePublicationHtml(payload.body_html) : null;
    const plain = bodyHtml ? sanitizeHtml(bodyHtml.replace(/<br\s*\/?>|<\/(p|h1|h2|li|blockquote|ol|ul)>/gi, "\n"), { allowedTags: [], allowedAttributes: {} }).replace(/\n{3,}/g, "\n\n").trim() : null;
    const service = createServiceClient();
    const { data: event, error } = await service.rpc("receive_nrcs_event", { p_event: { ...payload, body_html: bodyHtml, description: plain || null } });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!event?.id || event.nrcs_source_id !== payload.id || event.district_key !== payload.district_key || event.status !== payload.status) throw new Error("CMS event receipt could not be verified.");
    return NextResponse.json({ ok: true, table: "events", cms_event_id: event.id, event_id: event.id, nrcs_source_id: event.nrcs_source_id, district_key: event.district_key, status: event.status, cms_supabase_host: process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Event receiving failed." }, { status: 400 });
  }
}
