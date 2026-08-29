import { NextResponse } from "next/server";
import { requireNrcsStaff } from "@/lib/auth";
import { createNrcsServerClient } from "@/lib/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireNrcsStaff("contributor");
  const { id: storyId } = await params;
  const body = await request.json().catch(() => ({}));
  const assetId = String(body.assetId || "").trim();
  const relationship = String(body.relationship || "supporting").trim() || "supporting";

  if (!assetId) {
    return NextResponse.json({ error: "Asset is required." }, { status: 400 });
  }

  const supabase = await createNrcsServerClient();
  const { error } = await supabase.from("nrcs_story_assets").insert({
    story_id: storyId,
    asset_id: assetId,
    relationship,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
