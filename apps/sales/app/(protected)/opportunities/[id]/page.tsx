import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSalesIdentity } from "@/lib/auth";
import { logContact, updateOpportunity } from "@/lib/customer-actions";
import { editableStages, stageLabels } from "@/lib/workflow.mjs";
import Notice from "@/components/Notice";
export default async function Opportunity({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
 const { supabase } = await requireSalesIdentity(); const { id } = await params; const query = await searchParams;
 const { data: opportunity, error } = await supabase.from("sales_opportunities").select("*").eq("id",id).maybeSingle();
 if (error) throw new Error("Opportunity unavailable."); if (!opportunity) notFound();
 const [{ data: company, error: companyError }, { data: history, error: historyError }] = await Promise.all([
 supabase.from("sales_organizations").select("company_name").eq("id",opportunity.organization_id).single(),
 supabase.from("sales_contact_history").select("id, method, summary, contacted_at").eq("opportunity_id",id).order("contacted_at",{ ascending:false }),
 ]);
 if (companyError || historyError) throw new Error("Opportunity history unavailable.");
 const editable = editableStages.includes(opportunity.stage);
 return <><Link href={`/customers/${opportunity.organization_id}`}>Back to organization</Link><h1>{company?.company_name}</h1><p><span className="badge">{opportunity.district_key.toUpperCase()}</span> {stageLabels[opportunity.stage as keyof typeof stageLabels]}</p><Notice {...query} />
 <section className="card"><h2>Business goal &amp; next action</h2><p>Start with the business&apos;s actual problem. Record what the customer said; do not promise reach or outcomes.</p><form action={updateOpportunity}>
 <input type="hidden" name="opportunity_id" value={id} /><input type="hidden" name="version" value={opportunity.version} />
 <label>Stage<select name="stage" defaultValue={opportunity.stage} disabled={!editable}>{editableStages.map(s => <option key={s} value={s}>{stageLabels[s as keyof typeof stageLabels]}</option>)}</select></label>
 <label>Customer&apos;s goal<textarea name="business_goal" maxLength={3000} defaultValue={opportunity.business_goal} /></label>
 <label>Proposed product<input name="proposed_product" maxLength={200} defaultValue={opportunity.proposed_product} placeholder="For example: four Tuesday Daily Specials" /></label>
 <label>Next action<input name="next_action" maxLength={1000} defaultValue={opportunity.next_action} /></label>
 <label>Next action date (Central)<input name="next_action_on" type="date" defaultValue={opportunity.next_action_on || ""} /></label>
 <label>Lost reason (required when Lost)<textarea name="lost_reason" maxLength={2000} defaultValue={opportunity.lost_reason} /></label><button disabled={!editable}>Save opportunity</button></form></section>
 <section className="card"><h2>Record contact</h2><form action={logContact}><input type="hidden" name="opportunity_id" value={id} /><label>Method<select name="method"><option value="phone">Phone</option><option value="email">Email</option><option value="in_person">In person</option><option value="other">Other</option></select></label><label>What was discussed?<textarea name="summary" maxLength={5000} required /></label><button>Record contact</button></form></section>
 <section className="card"><h2>Contact history</h2>{history?.map(h => <div className="history" key={h.id}><p><strong>{h.method.replaceAll("_"," ")}</strong> · {new Date(h.contacted_at).toLocaleString("en-US",{timeZone:"America/Chicago"})} Central</p><p>{h.summary}</p></div>)}{!history?.length && <p>No contact recorded yet.</p>}</section>
 </>;
}
