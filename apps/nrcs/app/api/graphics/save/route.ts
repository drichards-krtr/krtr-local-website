import { NextResponse } from "next/server";
import { getCurrentNrcsStaff } from "@/lib/auth";
import { createNrcsServerClient } from "@/lib/server";
import { uploadGeneratedImage } from "@/lib/cloudinary";
import { GRAPHIC_BUILDERS, UUID_PATTERN } from "@/lib/graphics";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const staff = await getCurrentNrcsStaff();
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get("image");
    const id = String(form.get("requestId") || "");
    const title = String(form.get("title") || "").trim();
    const builder = String(form.get("builder") || "");
    const district = String(form.get("districtKey") || "");
    const storyId = String(form.get("storyId") || "") || null;
    const editionId = String(form.get("editionId") || "") || null;
    const itemId = String(form.get("itemId") || "") || null;
    const categoryId = String(form.get("categoryId") || "") || null;
    const tagIds = form.getAll("tagId").map(String);
    if (!UUID_PATTERN.test(id) || !title || title.length > 240 || !GRAPHIC_BUILDERS.includes(builder as never)) throw new Error("Valid request, builder, and asset title are required.");
    for (const value of [storyId, editionId, itemId, categoryId, ...tagIds]) if (value && !UUID_PATTERN.test(value)) throw new Error("Invalid object ID.");
    if (storyId && editionId || itemId && !editionId) throw new Error("Invalid attachment context.");
    if (!(file instanceof File) || file.type !== "image/png" || file.size > 3_500_000 || file.size === 0) throw new Error("A PNG under 3.5 MB is required.");
    const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (bytes.join(",") !== "137,80,78,71,13,10,26,10") throw new Error("Invalid PNG.");
    const supabase = await createNrcsServerClient();
    const { data: canAccess } = await supabase.rpc("nrcs_can_access_district", { requested_district_key: district });
    if (!canAccess) return NextResponse.json({ error: "District is not accessible." }, { status: 403 });
    if (storyId) {
      const { data: story } = await supabase.from("nrcs_stories").select("district_key, created_by").eq("id", storyId).maybeSingle();
      if (!story || story.district_key !== district || staff.profile.role === "contributor" && story.created_by !== staff.profile.id) return NextResponse.json({ error: "Story is not editable." }, { status: 403 });
    }
    if (editionId) {
      const { data: edition } = await supabase.from("nrcs_editions").select("district_key").eq("id", editionId).maybeSingle();
      if (!edition || edition.district_key !== district || staff.profile.role === "contributor") return NextResponse.json({ error: "Edition is not editable." }, { status: 403 });
    }
    if (itemId) {
      const { data: item } = await supabase.from("nrcs_rundown_items").select("edition_id").eq("id", itemId).maybeSingle();
      if (item?.edition_id !== editionId) throw new Error("Item does not belong to this Edition.");
    }
    if (categoryId) {
      const { data: category } = await supabase.from("nrcs_categories").select("district_key").eq("id", categoryId).maybeSingle();
      if (category?.district_key !== district) throw new Error("Category does not belong to this district.");
    }
    if (tagIds.length) {
      const { data: tags } = await supabase.from("nrcs_tags").select("id").in("id", [...new Set(tagIds)]);
      if (tags?.length !== new Set(tagIds).size) throw new Error("Invalid tags.");
    }
    const { data: existing } = await supabase.from("nrcs_assets").select("id, created_by").eq("id", id).maybeSingle();
    if (existing && existing.created_by !== staff.profile.id) return NextResponse.json({ error: "Request belongs to another user." }, { status: 403 });
    const uploaded = await uploadGeneratedImage(file, `krtr/generated/${staff.profile.id}/${id}`);
    const settings = JSON.parse(String(form.get("settings") || "{}"));
    const { error } = await supabase.rpc("nrcs_register_generated_graphic", {
      p_asset: { id, title, district_key: district, category_id: categoryId, cloudinary_public_id: uploaded.publicId, cloudinary_url: uploaded.url, metadata: { generator: builder, settings, width: uploaded.width, height: uploaded.height } },
      p_story: storyId, p_edition: editionId, p_item: itemId, p_tags: [...new Set(tagIds)],
    });
    if (error) return NextResponse.json({ error: "Cloudinary upload succeeded, but NRCS save failed. Retry Save to reuse this upload. " + error.message }, { status: 500 });
    return NextResponse.json({ ok: true, assetId: id, url: uploaded.url, message: storyId || editionId ? "Graphic saved to Cloudinary and attached." : "Graphic saved to the shared asset pool." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save graphic." }, { status: 400 });
  }
}
