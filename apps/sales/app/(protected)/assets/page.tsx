import Link from "next/link";
import {requireSalesIdentity} from "@/lib/auth";
import {allRows} from "@/lib/collections";
import Notice from "@/components/Notice";
export default async function Assets({searchParams}:{searchParams:Promise<{notice?:string;error?:string}>}){
 const {supabase,isSalesStaff,isProductionAgent}=await requireSalesIdentity();const assets=await allRows((a,b)=>supabase.from("sales_assets").select("id,label,kind,origin,current_version,intake_version").order("created_at",{ascending:false}).order("id").range(a,b));
 return <><h1>{isProductionAgent?"Assigned production queue":"Assets & advertiser approvals"}</h1><Notice {...await searchParams}/><p>Each graphic has its own identity, version history and revision allowance. Approval covers the exact artwork and copy shown. Unchanged approved reuse is free.</p>{isSalesStaff&&<Link href="/assets/new">Add an asset or replacement</Link>}<div className="grid">{assets.map(a=><section className="card" key={a.id}><h2><Link href={`/assets/${a.id}`}>{a.label}</Link></h2><p>{a.kind} · {a.origin==="krtr"?"KRTR creation":"Advertiser supplied"} · {a.current_version?`Version ${a.current_version}`:"No finished version yet"}</p><p>{a.intake_version?"Intake on file":"Production intake needed"}</p></section>)}</div>{!assets.length&&<p>{isProductionAgent?"No assets are assigned to you in your current district scope.":"No advertising assets in your scope yet."}</p>}</>;
}
