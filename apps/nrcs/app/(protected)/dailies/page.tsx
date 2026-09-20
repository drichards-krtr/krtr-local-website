import { requireNrcsStaff } from "@/lib/auth";
import { createNrcsServerClient } from "@/lib/server";
import { getNrcsDistrictContext } from "@/lib/districts";
import NrcsDailiesManager from "@/components/NrcsDailiesManager";

export default async function DailiesPage({ searchParams }: { searchParams: Promise<{ district?: string }> }) {
  await requireNrcsStaff("editor");
  const params = await searchParams; const context = await getNrcsDistrictContext();
  const district = context.allowedDistricts.find(item => item.district_key === params.district) || context.activeDistrict;
  if (!district) return <p>No accessible district.</p>;
  const supabase = await createNrcsServerClient();
  const [dailies, editions, categories, tags] = await Promise.all([
    supabase.from("nrcs_dailies").select("*").eq("district_key", district.district_key).order("scheduled_at", { ascending: false }).limit(100),
    supabase.from("nrcs_editions").select("id,title,nrcs_edition_assets(nrcs_assets(id,title,asset_type,cloudinary_url,thumbnail_url,mux_status,mux_playback_id))").eq("district_key", district.district_key).order("air_at", { ascending: false }).limit(200),
    supabase.from("nrcs_categories").select("id,name").eq("district_key", district.district_key).eq("enabled", true).order("name"),
    supabase.from("nrcs_tags").select("id,name,tag_type").order("name"),
  ]);
  const usable = (editions.data || []).map(edition => ({ id: edition.id, title: edition.title, assets: (edition.nrcs_edition_assets || []).flatMap((link: any) => { const asset = Array.isArray(link.nrcs_assets) ? link.nrcs_assets[0] : link.nrcs_assets; return asset && (["image","graphic"].includes(asset.asset_type) && asset.cloudinary_url || asset.asset_type === "video" && asset.mux_status === "ready" && asset.mux_playback_id) ? [{ id: asset.id, title: asset.title, asset_type: asset.asset_type, thumbnail_url: asset.thumbnail_url || asset.cloudinary_url || null }] : []; }) }));
  return <div className="grid gap-5"><h1 className="text-2xl font-semibold">Dailies</h1><form className="flex items-end gap-3"><label className="grid gap-1 text-sm"><span>District</span><select name="district" defaultValue={district.district_key} className="rounded border px-3 py-2">{context.allowedDistricts.map(item => <option key={item.district_key} value={item.district_key}>{item.display_name}</option>)}</select></label><button className="rounded border bg-white px-4 py-2 text-sm">Apply</button></form>{dailies.error || editions.error || categories.error || tags.error ? <p role="alert" className="text-red-800">{dailies.error?.message || editions.error?.message || categories.error?.message || tags.error?.message}</p> : <NrcsDailiesManager districtKey={district.district_key} timezone={district.timezone} initialDailies={dailies.data || []} editions={usable} categories={categories.data || []} tags={tags.data || []} />}</div>;
}
