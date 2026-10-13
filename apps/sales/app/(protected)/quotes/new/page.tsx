import Link from "next/link";
import {redirect} from "next/navigation";
import {requireSalesIdentity} from "@/lib/auth";
import {allRows} from "@/lib/collections";
import {quoteEditorData} from "@/lib/quote-data";
import QuoteEditor from "@/components/QuoteEditor";
export default async function NewQuote({searchParams}:{searchParams:Promise<{organization?:string;opportunity?:string}>}){
 const identity=await requireSalesIdentity();if(!identity.isSalesStaff)redirect("/quotes");
 const p=await searchParams;
 if(!p.organization){const orgs=await allRows((a,b)=>identity.supabase.from("sales_organizations").select("id,company_name").order("company_name").order("id").range(a,b));return <><h1>New quote</h1><p>Choose an organization with district access.</p>{orgs.map(o=><p key={o.id}><Link href={`/quotes/new?organization=${o.id}`}>{o.company_name}</Link></p>)}</>;}
 const data=await quoteEditorData(p.organization);
 return <><h1>Quote for {data.organization.company_name}</h1><QuoteEditor organizationId={p.organization} products={data.products} districts={data.districts} shows={data.shows} studios={data.studios} opportunityId={p.opportunity}/></>;
}
