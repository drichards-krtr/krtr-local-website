import {requireSalesIdentity} from "@/lib/auth";
import {allRows} from "@/lib/collections";
import Link from "next/link";
import {centralTime} from "@/lib/quote-format.mjs";
export default async function Inventory(){const {supabase}=await requireSalesIdentity();
 const rows=await allRows((a,b)=>supabase.from("sales_inventory_units").select("agreement_id,quote_id,line_id,product_code,district_key,run_on,state,hold_until,payment_due_at").order("agreement_id").order("line_id").order("run_on").order("id").range(a,b));
 const groups=Object.values(rows.reduce<Record<string,typeof rows>>((out,r)=>{const key=r.agreement_id+":"+r.line_id+":"+r.state;(out[key]||=[]).push(r);return out;},{}));
 const contracts=await allRows((a,b)=>supabase.from("sales_industry_contracts").select("*").order("start_date").order("id").range(a,b));
 return <><h1>Inventory</h1><p>Unsigned quotes reserve nothing. Signed holds expire after five business days at 5pm Central or the earlier payment deadline. Expired holds remain in history and do not block new bookings.</p>{groups.map(g=>{const r=g[0];return <section className="card" key={r.agreement_id+r.line_id+r.state}><h2>{r.product_code} · {r.district_key}</h2><p>{g[0].run_on} through {g[g.length-1].run_on} · {g.length} placement dates</p><p>{r.state==="held"&&new Date(r.hold_until)<new Date()?"Expired hold":r.state} · hold ends {centralTime(r.hold_until)}</p><p>Payment due {centralTime(r.payment_due_at)}</p><Link href={`/quotes/${r.quote_id}`}>Open quote</Link></section>;})}{!groups.length&&<p>No signed reservations in your scope yet. The agreement workflow arrives in Chunk 4.</p>}<h2>Industry contracts in your management scope</h2>{contracts.map(c=><section className="card" key={c.id}><p>{c.industry} · {c.start_date} through {c.end_date} · {c.active?"enabled (effective while inventory is live)":"inactive"}</p><p>{c.district_keys.join(", ")} · {c.product_codes.join(", ")}</p></section>)}</>;
}
