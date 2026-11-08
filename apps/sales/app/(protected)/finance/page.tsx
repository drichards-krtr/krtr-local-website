import Link from "next/link";
import {redirect} from "next/navigation";
import {randomUUID} from "node:crypto";
import {requireSalesIdentity} from "@/lib/auth";
import {allRows} from "@/lib/collections";
import {money,centralTime,sumCents} from "@/lib/quote-format.mjs";
import {receiveCheck,updateCheck,expireHolds} from "@/lib/finance-actions";
import Notice from "@/components/Notice";
export default async function Finance({searchParams}:{searchParams:Promise<{notice?:string;error?:string}>}){
 const {supabase,isSalesStaff}=await requireSalesIdentity();if(!isSalesStaff)redirect("/agreements");
 const [invoices,checks,events,agreements,units]=await Promise.all([
 allRows((a,b)=>supabase.from("sales_invoices").select("*").order("due_at").order("id").range(a,b)),
 allRows((a,b)=>supabase.from("sales_checks").select("*").order("created_at").order("id").range(a,b)),
 allRows((a,b)=>supabase.from("sales_payment_events").select("kind,amount_cents,id").order("id").range(a,b)),
 allRows((a,b)=>supabase.from("sales_agreements").select("id,snapshot").order("id").range(a,b)),
 allRows((a,b)=>supabase.from("sales_inventory_units").select("agreement_id,state,hold_until,id").order("id").range(a,b))]);
 const now=Date.now();const live=(id:string)=>units.some(u=>u.agreement_id===id)&&units.filter(u=>u.agreement_id===id).every(u=>u.state==="booked"||(u.state==="held"&&Date.parse(u.hold_until)>now));
 const names=Object.fromEntries(agreements.map(a=>[a.id,a.snapshot.organization_name]));
 return <><h1>Payments &amp; holds</h1><Notice {...await searchParams}/><p>Urgent unpaid invoices, checks awaiting action and paid booking conflicts appear first. Cleared payment is separate from production readiness.</p><form action={expireHolds}><button className="secondary">Release expired holds in my scope</button></form>
 <div className="grid">{[["Booked advertising (live inventory)",sumCents(invoices.filter(i=>live(i.agreement_id)),"advertising_cents")],["Invoiced",sumCents(invoices,"total_cents")],["Collected",sumCents(invoices,"collected_cents")],["Refunded",sumCents(invoices,"refunded_cents")],["Processor fees",sumCents(events.filter(e=>e.kind==="processor_fee"),"amount_cents")],["Bank payouts",sumCents(events.filter(e=>e.kind==="bank_payout"),"amount_cents")]].map(([label,amount])=><section key={String(label)} className="card"><h2>{String(label)}</h2><p>{money(amount)}</p></section>)}</div>
 {[...invoices].sort((a,b)=>Number(b.inventory_status==="payment_conflict")-Number(a.inventory_status==="payment_conflict")||Number(a.collected_cents>0)-Number(b.collected_cents>0)).map(i=>{const active=checks.find(c=>c.invoice_id===i.id&&c.state!=="returned");return <section className="card" key={i.id}><h2><Link href={`/agreements/${i.agreement_id}`}>{names[i.agreement_id]} · KRTR-{i.invoice_number}</Link></h2><p>{money(i.total_cents)} · collected {money(i.collected_cents)} · refunded {money(i.refunded_cents)}</p>{i.payment_review_required&&<p className="error">Unexpected or additional payment recorded. Manager reconciliation is required.</p>}<p>Payment due {centralTime(i.due_at)} · inventory {i.inventory_status==="held"&&!live(i.agreement_id)?"expired / release pending":i.inventory_status.replaceAll("_"," ")}</p>{i.inventory_status==="payment_conflict"&&<p className="error">Resolve available new dates with the customer. Payment did not reactivate inventory.</p>}
 {!i.collected_cents&&!active&&<form action={receiveCheck}><input type="hidden" name="invoice_id" value={i.id}/><input type="hidden" name="request_id" value={randomUUID()}/><label>Check reference (no bank account numbers)<input name="reference" maxLength={200} required/></label><label>Actual received date<input name="on_date" type="date" required/></label><button>Record received · not cleared</button></form>}
 {checks.filter(c=>c.invoice_id===i.id).map(c=><div key={c.id}><h3>Check {c.reference} · {c.state}</h3><p>Received {c.received_on}{c.deposited_on&&` · deposited ${c.deposited_on}`}{c.cleared_on&&` · cleared ${c.cleared_on}`}</p>{["received","deposited"].includes(c.state)&&<form action={updateCheck}><input name="check_id" type="hidden" value={c.id}/><label>Actual action date<input name="on_date" type="date" required/></label><div className="row">{c.state==="received"&&<button name="intent" value="deposit">Record deposit</button>}{c.state==="deposited"&&<button name="intent" value="clear">Manager: verify cleared funds</button>}<button name="intent" value="return" className="secondary">Manager: record returned unpaid</button></div></form>}</div>)}</section>;})}{!invoices.length&&<p>No signed invoices in your scope yet.</p>}</>;
}
