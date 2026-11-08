import Link from "next/link";
import {requireSalesIdentity} from "@/lib/auth";
import {allRows} from "@/lib/collections";
import {money,centralTime} from "@/lib/quote-format.mjs";
export default async function Agreements(){const {supabase}=await requireSalesIdentity();
 const rows=await allRows((a,b)=>supabase.from("sales_agreements").select("id,snapshot,created_at").order("created_at",{ascending:false}).order("id").range(a,b));
 return <><h1>Agreements &amp; invoices</h1><p>Signed terms remain fixed. Payment, inventory and production readiness are tracked separately.</p>{rows.map(r=><section className="card" key={r.id}><h2><Link href={`/agreements/${r.id}`}>{r.snapshot.organization_name} · {money(r.snapshot.total_cents)}</Link></h2><p>Signed {centralTime(r.created_at)} · quote version {r.snapshot.version}</p></section>)}{!rows.length&&<p>No signed agreements available. Review a shared quote to sign it.</p>}</>;
}
