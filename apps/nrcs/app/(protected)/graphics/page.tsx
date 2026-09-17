import Link from "next/link";
import { notFound } from "next/navigation";
import { requireNrcsStaff } from "@/lib/auth";
import { createNrcsServerClient } from "@/lib/server";
import { getNrcsDistrictContext } from "@/lib/districts";
import { generatorDocument } from "@/lib/generators/document";
import { GRAPHIC_BUILDERS, type GraphicBuilder, type GraphicContext, type SchoolIdentity } from "@/lib/graphics";
import NrcsGraphicBuilder from "@/components/NrcsGraphicBuilder";

export default async function GraphicsPage({searchParams}: {searchParams:Promise<{district?:string;builder?:string;story?:string;edition?:string;item?:string}>}) {
  const {profile} = await requireNrcsStaff();
  const query = await searchParams;
  const {activeDistrict, allowedDistricts} = await getNrcsDistrictContext();
  const districtKey = query.district || activeDistrict?.district_key || "dlpc";
  if (!allowedDistricts.some(d=>d.district_key===districtKey)) notFound();
  const builder = (query.builder || "generic") as GraphicBuilder;
  if(!GRAPHIC_BUILDERS.includes(builder) || query.story && query.edition || query.item && !query.edition) notFound();
  const supabase = await createNrcsServerClient();
  const context: GraphicContext = {districtKey, storyId:query.story, editionId:query.edition, itemId:query.item};
  if(query.story) {
    const {data:story,error} = await supabase.from("nrcs_stories").select("title,district_key,created_by").eq("id",query.story).maybeSingle();
    if(error) throw new Error(error.message);
    if(!story || story.district_key!==districtKey || profile.role==="contributor" && story.created_by!==profile.id) notFound();
    context.label=story.title;
  }
  if(query.edition) {
    const {data:edition,error} = await supabase.from("nrcs_editions").select("title,district_key").eq("id",query.edition).maybeSingle();
    if(error) throw new Error(error.message);
    if(!edition || edition.district_key!==districtKey || profile.role==="contributor") notFound();
    context.label=edition.title;
    if(query.item) {
      const {data:item,error:itemError} = await supabase.from("nrcs_rundown_items").select("title,edition_id").eq("id",query.item).maybeSingle();
      if(itemError) throw new Error(itemError.message);
      if(item?.edition_id!==query.edition) notFound();
      context.label+=" - "+item.title;
    }
  }
  const [selection, schools, categories, tags] = await Promise.all([
    supabase.from("nrcs_district_schools").select("school_id,is_default").eq("district_key",districtKey),
    supabase.from("nrcs_school_identities").select("*").order("display_name"),
    supabase.from("nrcs_categories").select("id,name").eq("district_key",districtKey).eq("enabled",true).order("name"),
    supabase.from("nrcs_tags").select("id,name").order("name"),
  ]);
  for(const result of [selection,schools,categories,tags]) if(result.error) throw new Error(result.error.message);
  const selectedIds = new Set((selection.data||[]).map(row=>row.school_id));
  const selectedSchools = (schools.data||[]).filter(s=>selectedIds.has(s.id)) as SchoolIdentity[];
  const defaultId = selection.data?.find(row=>row.is_default)?.school_id || null;
  return <div className="grid min-w-0 gap-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Graphics</h1>
      <form className="flex gap-2"><input type="hidden" name="builder" value={builder} /><select name="district" defaultValue={districtKey} className="rounded border border-neutral-300 px-3 py-2 text-sm">{allowedDistricts.map(d=><option key={d.district_key} value={d.district_key}>{d.display_name}</option>)}</select><button className="rounded border border-neutral-300 px-3 py-2 text-sm">Apply</button></form>
    </header>
    {builder==="sports" && !selectedSchools.length && <p className="text-sm text-amber-800">No schools selected for this district.{profile.role!=="contributor" && <Link href={`/schools?district=${districtKey}`} className="ml-2 underline">Manage Schools</Link>}</p>}
    <NrcsGraphicBuilder key={`${builder}-${districtKey}-${query.story||query.edition||""}-${query.item||""}`} builder={builder} context={context} categories={categories.data||[]} tags={tags.data||[]} documentHtml={generatorDocument(builder,selectedSchools,defaultId)} />
  </div>;
}
