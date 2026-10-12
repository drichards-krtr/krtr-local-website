import Link from "next/link";
import { allRows } from "@/lib/collections";
import { requireSalesIdentity } from "@/lib/auth";
import { createCustomer, seedLaunchProspects } from "@/lib/customer-actions";
import Notice from "@/components/Notice";
export default async function Customers({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
 const { supabase, isSalesStaff, isOwner } = await requireSalesIdentity();
 const params = await searchParams;
 const customers = await allRows((from,to) => supabase.from("sales_organizations").select("id, company_name, salesperson_id").order("company_name").order("id").range(from,to));
 const { data: districts, error: districtError } = await supabase.rpc("sales_creation_districts");
 if (districtError) throw new Error("Customer list unavailable.");
 return <><h1>{isSalesStaff ? "Customers & prospects" : "Your organizations"}</h1><Notice {...params} />
 <p className="muted">{isSalesStaff ? "One company across districts. Each opportunity records its own district and next action." : "Only organizations that have granted you access appear here."}</p>
 <div className="grid">{customers?.map(c => <section className="card" key={c.id}><h2><Link href={`/customers/${c.id}`}>{c.company_name}</Link></h2><Link href={`/customers/${c.id}`}>Open organization</Link></section>)}</div>
 {!customers?.length && <p>No customer organizations in your scope yet.</p>}
 {isSalesStaff && <section className="card"><h2>Add customer or prospect</h2><form action={createCustomer}>
 <label>Business name<input name="company_name" maxLength={200} required /></label>
 <label>Initial district<select name="district_key" required>{districts?.map((d: { district_key: string; name: string }) => <option key={d.district_key} value={d.district_key}>{d.name}</option>)}</select></label>
 <div className="grid"><label>Contact name<input name="contact_name" maxLength={200} /></label><label>Contact email<input name="contact_email" type="email" maxLength={320} /></label><label>Contact phone<input name="contact_phone" type="tel" maxLength={100} /></label><label>Business location<input name="business_location" maxLength={500} /></label></div><button>Add customer &amp; first follow-up</button></form></section>}
 {isOwner && <section className="card"><h2>Launch prospects</h2><p>The Old Stone Bistro, The Getaway Bar and Grill, and La Porte City Golf Club. Contact details and business goals remain unfilled until confirmed.</p><p>The Dysart restaurant remains unnamed pending your confirmation.</p><form action={seedLaunchProspects}><button className="secondary">Add the three named prospects</button></form></section>}
 </>;
}
