import { requireSalesOwner } from "@/lib/auth";
import { setProfileActive, assignStaffScope, removeStaffScope } from "@/lib/actions";
export default async function Access({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { supabase, user } = await requireSalesOwner();
  const { notice } = await searchParams;
  const results = await Promise.all([
    supabase.from("sales_profiles").select("id, display_name, active").order("created_at"),
    supabase.from("sales_staff_scopes").select("id, user_id, role, district_key, region_id"),
    supabase.from("sales_districts").select("district_key, name"),
    supabase.from("sales_regions").select("id, name"),
  ]);
  if (results.some(r => r.error)) throw new Error("Access configuration unavailable.");
  const profiles = results[0].data || [];
  const scopes = results[1].data || [];
  const districts = results[2].data || [];
  const regions = results[3].data || [];
  return <><h1>Staff access</h1><p>New accounts start inactive. Activate only verified identities and assign the access they need. Customer organization invitations will be added in Chunk 2.</p>
    {notice && <p role="status" className={notice === "saved" ? "success" : "error"}>{notice === "saved" ? "Saved." : "Unable to save. Check the user and scope."}</p>}
    {profiles.map(p => <section className="card" key={p.id}><h2>{p.display_name || "Unnamed account"}</h2><p className="muted">User ID: {p.id}</p><p>{p.active ? "Active" : "Inactive"}{p.id === user.id ? " · Owner" : ""}</p>{p.id !== user.id && <form action={setProfileActive}><input type="hidden" name="user_id" value={p.id} /><input type="hidden" name="active" value={String(!p.active)} /><button>{p.active ? "Deactivate" : "Activate"}</button></form>}
    <ul>{scopes.filter(s => s.user_id === p.id).map(s => <li key={s.id}><div className="row"><span>{s.role.replaceAll("_", " ")} · {s.district_key || regions.find(r => r.id === s.region_id)?.name || "Region"}</span><form action={removeStaffScope}><input type="hidden" name="id" value={s.id} /><button className="secondary">Remove scope</button></form></div></li>)}</ul></section>)}
    <section className="card"><h2>Assign staff scope</h2><form action={assignStaffScope}><label>Verified account<select name="user_id" required><option value="">Select account</option>{profiles.filter(p => p.id !== user.id).map(p => <option key={p.id} value={p.id}>{p.display_name || p.id}</option>)}</select></label>
    <label>Role<select name="role"><option value="salesperson">Salesperson</option><option value="district_manager">District manager</option><option value="regional_manager">Regional manager</option><option value="production_agent">Production agent</option></select></label>
    <label>District (leave empty for regional manager)<select name="district_key"><option value="">None</option>{districts.map(d => <option key={d.district_key} value={d.district_key}>{d.name}</option>)}</select></label>
    <label>Region (regional manager only)<select name="region_id"><option value="">None</option>{regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label><button>Assign scope</button></form></section>
  </>;
}
