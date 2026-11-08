import {notFound} from "next/navigation";
import {requireSalesIdentity} from "@/lib/auth";
import AgreementTerms from "@/components/AgreementTerms";
import PrintButton from "@/components/PrintButton";
export default async function PrintQuote({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{version?:string}>}){
 const {id}=await params;const p=await searchParams;const {supabase}=await requireSalesIdentity();
 const {data:versions,error}=await supabase.from("sales_quote_versions").select("version,content,policy_id").eq("quote_id",id).order("version",{ascending:false}).limit(1).eq("version",Number(p.version));if(error||!versions?.length)notFound();const v=versions[0];
 const {data:q}=await supabase.from("sales_quotes").select("organization_id").eq("id",id).single();if(!q)notFound();const {data:org}=await supabase.from("sales_organizations").select("company_name").eq("id",q.organization_id).single();
 return <><h1>KRTR Local advertising agreement</h1><p>{org?.company_name} · Quote {id} · version {v.version} · policy {v.policy_id}</p><p className="notice">Unsigned agreement for review. Printing does not reserve inventory; staff must record the signed copy and recheck availability.</p><PrintButton/><AgreementTerms content={v.content}/><section className="card"><p>Authorized signer: ____________________________________</p><p>Signature: ____________________________________ Date: __________________</p><p>Signing accepts this exact agreement version, placements, prices, dates, deadlines and policies on behalf of the organization.</p></section></>;
}
