import Link from "next/link";
import { createNrcsServerClient } from "@/lib/server";
export default async function NrcsEditionGraphics({editionId,districtKey}:{editionId:string;districtKey:string}) {
  const supabase=await createNrcsServerClient();
  const {data:links,error}=await supabase.from("nrcs_edition_assets")
    .select("asset_id,rundown_item_id,nrcs_assets(id,title,cloudinary_url),nrcs_rundown_items(title)").eq("edition_id",editionId).order("created_at");
  if(error)throw new Error("Unable to load Edition graphics: "+error.message);
  return <section className="grid gap-4 border-y border-neutral-200 py-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Edition Graphics</h2><Link href={`/graphics?district=${districtKey}&edition=${editionId}`} className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold">Create Graphic</Link></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{(links||[]).map(link=>{
      const asset=Array.isArray(link.nrcs_assets)?link.nrcs_assets[0]:link.nrcs_assets;
      const item=Array.isArray(link.nrcs_rundown_items)?link.nrcs_rundown_items[0]:link.nrcs_rundown_items;
      if(!asset)return null;
      return <article key={asset.id} className="grid gap-2 rounded border border-neutral-200 bg-white p-3"><div className="aspect-video bg-neutral-100">{asset.cloudinary_url&&<a href={asset.cloudinary_url} target="_blank" rel="noreferrer"><img src={asset.cloudinary_url} alt={asset.title} className="h-full w-full object-contain"/></a>}</div><h3 className="text-sm font-semibold">{asset.title}</h3>{item&&<p className="text-xs text-neutral-500">{item.title}</p>}</article>;
    })}</div>
    {!links?.length&&<p className="text-sm text-neutral-500">No graphics attached.</p>}
  </section>;
}
