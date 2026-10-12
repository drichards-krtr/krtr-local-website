import Link from "next/link";
import { allRows } from "@/lib/collections";
import { requireSalesIdentity } from "@/lib/auth";
import { readNotification } from "@/lib/customer-actions";
import WorkList from "@/components/WorkList";
import Notice from "@/components/Notice";
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
 const { supabase, isSalesStaff, isProductionAgent } = await requireSalesIdentity();
 const params = await searchParams;
 const [companies, work, notices] = await Promise.all([
 allRows((from,to) => supabase.from("sales_organizations").select("id, company_name").order("id").range(from,to)),
 allRows((from,to) => supabase.from("sales_opportunities").select("id, organization_id, district_key, stage, next_action, next_action_on, business_goal, proposed_product, last_contact_at").order("id").range(from,to)),
 allRows((from,to) => supabase.from("sales_notifications").select("id, message, action_path, created_at").is("read_at",null).order("created_at",{ ascending:false }).order("id").range(from,to)),
 ]);
 const names = Object.fromEntries((companies || []).map(c => [c.id,c.company_name]));
 return <><p className="eyebrow">Your workspace</p><h1>{isSalesStaff ? "Actions & follow-ups" : isProductionAgent ? "Production workspace" : "Your advertising account"}</h1><Notice {...params} />
 {notices?.length ? <section><h2>Needs your attention</h2>{notices.map(n => <section className="card" key={n.id}><p>{n.message}</p><div className="row"><Link href={n.action_path}>Open action</Link><form action={readNotification}><input type="hidden" name="notification_id" value={n.id} /><button className="secondary">Mark read</button></form></div></section>)}</section> : null}
 {isSalesStaff ? <><p>All unfinished opportunities are shown, including future follow-ups and unanswered proposals. Dates use America/Chicago.</p><div className="row"><Link href="/customers">Customers &amp; prospects</Link><Link href="/pipeline">Full pipeline</Link><Link href="/access-requests">District access requests</Link></div><h2>Open sales work</h2><WorkList items={work || []} companies={names} /></> : <><p>{isProductionAgent ? <>Assigned district and show information is available under <Link href="/districts">Districts &amp; shows</Link>. Production asset workflows arrive in later chunks.</> : <>Review your organization&apos;s users and permissions. Campaigns, assets, agreements, and invoices arrive in later build chunks.</>}</p>{companies?.map(c => <section className="card" key={c.id}><h2><Link href={`/customers/${c.id}`}>{c.company_name}</Link></h2><Link href={`/customers/${c.id}`}>Open your organization</Link></section>)}{!companies?.length && <p>No organizations have granted this account view access.</p>}</>}
 <p className="notice">Quoting, reservations, signing, payments, approvals, and delivery are not enabled yet.</p></>;
}
