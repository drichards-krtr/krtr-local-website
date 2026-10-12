import { redirect } from "next/navigation";
import { requireSalesIdentity } from "@/lib/auth";
import { requestDistrictAccess, decideDistrictAccess } from "@/lib/customer-actions";
import Notice from "@/components/Notice";
export default async function AccessRequests({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
 const { supabase, user, isSalesStaff } = await requireSalesIdentity();if(!isSalesStaff)redirect("/dashboard");const query=await searchParams;
 const [{data:requests,error},{data:districts,error:districtError}]=await Promise.all([supabase.from("sales_district_access_requests").select("*").order("created_at",{ascending:false}),supabase.rpc("sales_expansion_districts")]);
 if(error||districtError)throw new Error("Access requests unavailable.");
 return <><h1>District access requests</h1><Notice {...query}/><p>Expanding an owned customer grants customer-specific access immediately. Broader district access requires approval from a scoped manager.</p><section className="card"><h2>Request broader access</h2><form action={requestDistrictAccess}><label>District<select name="district_key" required>{districts?.map((d:{district_key:string;name:string})=><option key={d.district_key} value={d.district_key}>{d.name}</option>)}</select></label><label>Reason<textarea name="reason" maxLength={2000} required/></label><button>Submit request</button></form></section>
 {requests?.map(r=><section className="card" key={r.id}><h2>{r.district_key.toUpperCase()} · {r.status}</h2><p>Applicant: {r.user_id===user.id?"You":r.user_id}</p><p>{r.reason}</p>{r.decision_reason&&<p>Decision: {r.decision_reason}</p>}{r.status==="pending"&&r.user_id!==user.id&&<form action={decideDistrictAccess}><input type="hidden" name="request_id" value={r.id}/><label>Decision reason<textarea name="reason" maxLength={2000} required/></label><div className="row"><button name="intent" value="approve">Approve district access</button><button name="intent" value="deny" className="secondary">Deny</button></div></form>}</section>)}
 </>;
}
