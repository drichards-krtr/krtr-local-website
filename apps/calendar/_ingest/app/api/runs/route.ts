import { timingSafeEqual } from "node:crypto";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const expected = process.env.CALENDAR_ORCHESTRATOR_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || expected.length < 32 || Buffer.byteLength(expected) !== Buffer.byteLength(supplied)
    || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const base = process.env.NRCS_API_BASE_URL;
  const secret = process.env.NRCS_CALENDAR_INGEST_SECRET;
  if (!base || !secret || secret.length < 32) return Response.json({ error: "NRCS integration is not configured" }, { status: 503 });
  let url: URL;
  try { url = new URL("/api/calendar-ingestion", base); if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error(); }
  catch { return Response.json({ error: "Invalid NRCS API origin" }, { status: 503 }); }
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Body required" }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.length;
      if (bytes > 1_000_000) { await reader.cancel(); return Response.json({ error: "Payload exceeds size limit" }, { status: 413 }); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: Buffer.concat(chunks), redirect: "error", signal: AbortSignal.timeout(20000), cache: "no-store" });
    if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Unexpected upstream response");
    return Response.json(await response.json(), { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "NRCS unavailable. Retry the identical payload with the same run_id." }, { status: 502 }); }
}
