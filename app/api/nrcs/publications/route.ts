import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { authorizeNrcsService, publicationHash, sanitizePublicationHtml } from "@/lib/nrcsPublication";
import { validatePublication, verifyPublicationReceipt } from "@/apps/nrcs/lib/editorialContract";

export const runtime = "nodejs";
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
    const { data, error } = await service.rpc("receive_nrcs_publication", { p_package: stored, p_hash: hash });
    if (error) return NextResponse.json({ error: error.message }, { status: /conflict|stale|cannot change/i.test(error.message) ? 409 : 422 });
    const receipt = verifyPublicationReceipt(data, envelope, hash);
    return NextResponse.json({ ok: true, receipt }, { headers: { "Cache-Control": "no-store" } });
  } catch (failure) {
    return NextResponse.json({ error: failure instanceof Error ? failure.message : "Invalid publication package." }, { status: 400 });
  }
}
