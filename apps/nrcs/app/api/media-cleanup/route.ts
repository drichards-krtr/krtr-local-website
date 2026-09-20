import { NextResponse } from "next/server";
import { getCurrentNrcsStaff } from "@/lib/auth";
import { auditOrphanMedia, deleteOrphanMedia } from "@/lib/mediaCleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function admin() { const staff = await getCurrentNrcsStaff(); return staff?.profile.role === "admin"; }
export async function GET() {
  if (!await admin()) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  try { return NextResponse.json({ ok: true, audit: await auditOrphanMedia() }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Audit failed." }, { status: 500 }); }
}
export async function DELETE(request: Request) {
  if (!await admin()) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({})); const count = Number(body.count);
    if (!Number.isSafeInteger(count) || count < 1 || body.confirmation !== `DELETE ${count} ORPHANED MEDIA`) throw new Error("Exact deletion confirmation is required.");
    const result = await deleteOrphanMedia(count);
    return NextResponse.json({ ok: true, deleted: result.deleted.length, audit: result.audit });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Cleanup failed." }, { status: 400 }); }
}
