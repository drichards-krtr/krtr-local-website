import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { authorizeNrcsService, publicationHash, sanitizePublicationHtml } from "@/lib/nrcsPublication";
import { validatePublication, verifyPublicationReceipt } from "@/apps/nrcs/lib/editorialContract";
import { nrcsPublishingEnabled } from "@/lib/editorialFeatureFlag";

export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!authorizeNrcsService(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const requestId = new URL(request.url).searchParams.get("request_id");
    if (!requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) throw new Error("Invalid request ID.");
    const service = createServiceClient();
    const { data, error } = await service.rpc("nrcs_web_publication_status", { p_request_id: requestId });
    if (error) return NextResponse.json({ error: error.message }, { status: 422 });
    if (data?.receipt?.public_url?.startsWith("/stories/")) {
      const { data: district, error: hostError } = await service.from("districts").select("subdomain").eq("district_key", data.receipt.district_key).single();
      if (hostError || !district?.subdomain) throw new Error("CMS district public host is unavailable.");
      const host = new URL(`https://${district.subdomain}`);
      if (host.username || host.password || host.pathname !== "/" || host.search || host.hash) throw new Error("CMS district public host is invalid.");
      data.receipt.public_url = new URL(data.receipt.public_url, host.origin).toString();
    }
    return NextResponse.json({ ok: true, confirmation: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (failure) {
    return NextResponse.json({ error: failure instanceof Error ? failure.message : "Status check failed." }, { status: 400 });
  }
}
export async function POST(request: Request) {
  if (!authorizeNrcsService(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 1_000_000) return NextResponse.json({ error: "Publication package exceeds 1 MB." }, { status: 413 });
    const envelope = validatePublication(JSON.parse(raw));
    const hash = publicationHash(envelope);
    // Hash the original validated instructions; sanitize independently before storage.
    const stored = envelope.kind === "web" ? { ...envelope, payload: { ...envelope.payload, body_html: sanitizePublicationHtml(envelope.payload.body_html) } } : envelope;
    const service = createServiceClient();
    const live = nrcsPublishingEnabled();
    let publicOrigin = new URL(request.url).origin;
    if (live) {
      const { data: district, error: districtError } = await service.from("districts").select("subdomain").eq("district_key", envelope.district_key).single();
      if (districtError || !district?.subdomain) throw new Error("CMS district public host is unavailable; publication not applied.");
      const host = new URL(`https://${district.subdomain}`);
      if (host.username || host.password || host.pathname !== "/" || host.search || host.hash) throw new Error("CMS district public host is invalid; publication not applied.");
      publicOrigin = host.origin;
    }
    const liveReceiver = { web: "receive_nrcs_web_publication", homepage: "receive_nrcs_homepage_publication", alert: "receive_nrcs_alert_publication", daily: "receive_nrcs_daily_publication" }[envelope.kind];
    const { data, error } = await service.rpc(live ? liveReceiver : "receive_nrcs_publication", { p_package: stored, p_hash: hash });
    if (error) return NextResponse.json({ error: error.message }, { status: /conflict|stale|cannot change/i.test(error.message) ? 409 : 422 });
    const enriched = data?.public_url === "/" || data?.public_url?.startsWith("/stories/") ? { ...data, public_url: new URL(data.public_url, publicOrigin).toString() } : data;
    const receipt = verifyPublicationReceipt(enriched, envelope, hash, live);
    return NextResponse.json({ ok: true, receipt }, { headers: { "Cache-Control": "no-store" } });
  } catch (failure) {
    return NextResponse.json({ error: failure instanceof Error ? failure.message : "Invalid publication package." }, { status: 400 });
  }
}
