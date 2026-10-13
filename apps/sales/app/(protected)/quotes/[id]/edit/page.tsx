import {notFound,redirect} from "next/navigation";
import {requireSalesIdentity} from "@/lib/auth";
import {quoteEditorData} from "@/lib/quote-data";
import QuoteEditor from "@/components/QuoteEditor";
export default async function Edit({params}:{params:Promise<{id:string}>}){
 const {id}=await params;const {supabase,isSalesStaff}=await requireSalesIdentity();if(!isSalesStaff)redirect(`/quotes/${id}`);
 const {data:q}=await supabase.from("sales_quotes").select("organization_id,current_version,status,opportunity_id").eq("id",id).single();if(!q)notFound();if(q.status==="accepted")redirect(`/quotes/${id}`);
 const {data:v}=await supabase.from("sales_quote_versions").select("content").eq("quote_id",id).eq("version",q.current_version).single();if(!v)notFound();const d=await quoteEditorData(q.organization_id);
 return <><h1>Revise quote for {d.organization.company_name}</h1><QuoteEditor organizationId={q.organization_id} quoteId={id} version={q.current_version} opportunityId={q.opportunity_id||undefined} initialLines={v.content.input_lines} products={d.products} districts={d.districts} shows={d.shows} studios={d.studios}/></>;
}
