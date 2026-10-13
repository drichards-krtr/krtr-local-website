import Link from "next/link";
import {requireSalesIdentity} from "@/lib/auth";
import {allRows} from "@/lib/collections";
import {decideQuoteOverride} from "@/lib/quote-actions";
import Notice from "@/components/Notice";
export default async function Overrides({searchParams}:{searchParams:Promise<{notice?:string;error?:string}>}){
 const {supabase}=await requireSalesIdentity();const requests=await allRows((a,b)=>supabase.from("sales_quote_overrides").select("*").eq("decision","pending").order("created_at").order("id").range(a,b));
 return <><h1>Quote exception review</h1><Notice {...await searchParams}/><p>Approvals require authority over the complete requested scope. Salespeople cannot approve their own exceptions. Approval does not change a quote until it is applied as a new version.</p>{requests.map(r=><section key={r.id} className="card"><h2><Link href={`/quotes/${r.quote_id}?version=${r.version}`}>Quote {r.quote_id.slice(0,8)} · version {r.version}</Link></h2><p>{r.reason}</p><p>Districts: {r.scope_districts.join(", ")}</p><pre>{JSON.stringify(r.terms,null,2)}</pre><details><summary>Exact quote baseline</summary><pre>{JSON.stringify(r.line_snapshot,null,2)}</pre></details><form action={decideQuoteOverride}><input name="override_id" type="hidden" value={r.id}/><label>Decision reason<textarea name="reason" required/></label><div className="row"><button name="intent" value="approve">Approve exact terms</button><button name="intent" value="deny" className="secondary">Deny</button></div></form></section>)}{!requests.length&&<p>No pending exceptions in your scope.</p>}</>;
}
