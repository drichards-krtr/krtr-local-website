import Link from "next/link";
import {requireSalesIdentity} from "@/lib/auth";
import {allRows} from "@/lib/collections";
import Notice from "@/components/Notice";
import {money} from "@/lib/quote-format.mjs";
export default async function Quotes({searchParams}:{searchParams:Promise<{notice?:string;error?:string}>}){
 const {supabase,isSalesStaff}=await requireSalesIdentity();
 const versions=await allRows((a,b)=>supabase.from("sales_quote_versions").select("quote_id,version,content,created_at").order("created_at",{ascending:false}).order("quote_id").order("version",{ascending:false}).range(a,b));
 const latest=versions.filter((v,i)=>versions.findIndex(x=>x.quote_id===v.quote_id)===i);
 return <><h1>Quotes</h1><Notice {...await searchParams}/>{isSalesStaff&&<Link href="/quotes/new">Create quote</Link>}<p>Quotes do not reserve space. Availability is checked again when an agreement is signed.</p><div className="grid">{latest.map(v=><section className="card" key={v.quote_id}><h2><Link href={`/quotes/${v.quote_id}`}>Quote · {v.quote_id.slice(0,8)}</Link></h2><p>Version {v.version} · {money(v.content.total_cents)}</p><p>{v.content.lines.map((l:{product_code:string})=>l.product_code).join(", ")}</p></section>)}</div>{!latest.length&&<p>No quotes available yet.</p>}</>;
}
