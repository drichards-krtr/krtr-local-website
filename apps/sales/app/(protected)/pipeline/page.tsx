import { allRows } from "@/lib/collections";
import { requireSalesIdentity } from "@/lib/auth";
import { redirect } from "next/navigation";
import WorkList from "@/components/WorkList";
export default async function Pipeline() {
 const { supabase, isSalesStaff } = await requireSalesIdentity();
 if (!isSalesStaff) redirect("/dashboard");
 const [companies, work] = await Promise.all([
 allRows((from,to) => supabase.from("sales_organizations").select("id, company_name").order("id").range(from,to)),
 allRows((from,to) => supabase.from("sales_opportunities").select("id, organization_id, district_key, stage, next_action, next_action_on, business_goal, proposed_product, last_contact_at").order("id").range(from,to)),
 ]);
 return <><h1>Sales pipeline</h1><p>Prospect → Contacted → Needs identified → Proposal sent → Signed / awaiting payment → Won.</p><p>Signed and Won are reserved for the verified agreement/payment workflows added later. Not now requires a follow-up date; Lost requires a reason.</p><WorkList items={work || []} companies={Object.fromEntries((companies || []).map(c => [c.id,c.company_name]))} includeClosed /></>;
}
