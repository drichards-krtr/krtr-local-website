import { requireNrcsStaff } from "@/lib/auth";
import { getNrcsDistrictContext } from "@/lib/districts";
import { createNrcsServerClient } from "@/lib/server";
import NrcsHomepageManager, { type HomepageLineup, type PriorityAlert } from "@/components/NrcsHomepageManager";

export default async function HomepagePage({ searchParams }: { searchParams: Promise<{ district?: string; story?: string; event?: string }> }) {
  await requireNrcsStaff("editor");
  const params = await searchParams;
  const context = await getNrcsDistrictContext();
  const district = params.district ? context.allowedDistricts.find(d => d.district_key === params.district) : context.activeDistrict;
  if (!district) return <p>No accessible district.</p>;
  const supabase = await createNrcsServerClient();
  const now = new Date().toISOString();
  const [lineup, alerts, currentAlert] = await Promise.all([
    supabase.from("nrcs_homepage_lineups").select("*").eq("district_key", district.district_key).maybeSingle(),
    supabase.from("nrcs_priority_alerts").select("*").eq("district_key", district.district_key).order("updated_at", { ascending: false }).limit(25),
    supabase.from("nrcs_priority_alerts").select("*").eq("district_key", district.district_key).eq("active", true).or(`start_at.is.null,start_at.lte.${now}`).or(`end_at.is.null,end_at.gt.${now}`).limit(1),
  ]);
  if (lineup.error || alerts.error || currentAlert.error) throw new Error(lineup.error?.message || alerts.error?.message || currentAlert.error?.message);
  const alertRows = [...(currentAlert.data || []), ...(alerts.data || []).filter(a => !currentAlert.data?.some(c => c.id === a.id))];
  return <div className="grid gap-5"><h1 className="text-2xl font-semibold">Homepage Editorial Controls</h1><form className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm"><span>District</span><select name="district" defaultValue={district.district_key} className="rounded border px-3 py-2">{context.allowedDistricts.map(d => <option key={d.district_key} value={d.district_key}>{d.display_name}</option>)}</select></label><button className="rounded border bg-white px-4 py-2 text-sm">Apply</button></form>
    <NrcsHomepageManager key={district.district_key} districtKey={district.district_key} timezone={district.timezone} initialLineup={lineup.data as HomepageLineup | null} initialAlerts={alertRows as PriorityAlert[]} initialTarget={params.story ? { type: "story", id: params.story } : params.event ? { type: "event", id: params.event } : null} />
  </div>;
}
