import { requireSalesOwner } from "@/lib/auth";
import { assignDistrictRegion, saveRegion } from "@/lib/actions";
export default async function Regions({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { supabase } = await requireSalesOwner();
  const { notice } = await searchParams;
  const [{ data: regions, error: regionError }, { data: districts, error: districtError }] = await Promise.all([
    supabase.from("sales_regions").select("id, name").order("name"),
    supabase.from("sales_districts").select("district_key, name, region_id").order("name"),
  ]);
  if (regionError || districtError) throw new Error("Region configuration is unavailable.");
  return <><h1>Regions &amp; assignments</h1><p>Only Dan can configure regions. District reassignment immediately changes regional access; the audit history retains each change.</p>
    {notice && <p role="status" className={notice === "saved" ? "success" : "error"}>{notice === "saved" ? "Saved." : notice === "invalid" ? "Enter a region name of 1–100 characters." : "Unable to save. Check the selection and try again."}</p>}
    <section className="card"><h2>Create region</h2><form action={saveRegion}><label>Name<input name="name" maxLength={100} required /></label><button>Create region</button></form></section>
    {regions?.map(r => <section className="card" key={r.id}><form action={saveRegion}><input type="hidden" name="id" value={r.id} /><label>Region name<input name="name" defaultValue={r.name} maxLength={100} required /></label><button>Save name</button></form></section>)}
    {!regions?.length && <p>No regions configured. None were created automatically.</p>}
    <h2>District assignments</h2>{districts?.map(d => <section className="card" key={d.district_key}><h3>{d.name}</h3><form action={assignDistrictRegion}><input type="hidden" name="district_key" value={d.district_key} /><label>Region<select name="region_id" defaultValue={d.region_id || ""}><option value="">Unassigned</option>{regions?.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label><button>Save assignment</button></form></section>)}
  </>;
}
