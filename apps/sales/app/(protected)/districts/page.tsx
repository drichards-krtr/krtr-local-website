import { requireSalesIdentity } from "@/lib/auth";
export default async function Districts() {
  const { supabase } = await requireSalesIdentity();
  const [{ data: districts, error: districtError }, { data: shows, error: showError }] = await Promise.all([
    supabase.from("sales_districts").select("district_key, name, timezone").order("name"),
    supabase.from("sales_shows").select("id, name, district_key, publication_weekdays, publication_time, publishes_on_holidays").order("name"),
  ]);
  if (districtError || showError) throw new Error("District setup is unavailable.");
  return <><h1>Districts &amp; shows</h1><p className="muted">Only districts within your assigned access are shown.</p><div className="grid">{districts?.map(d => <section className="card" key={d.district_key}><h2>{d.name}</h2><p>{d.timezone}</p>{shows?.filter(s => s.district_key === d.district_key).map(s => <div key={s.id}><h3>{s.name}</h3><p>Publication time: {s.publication_time} Central</p><p>{s.publishes_on_holidays ? "Booked weekday holiday placements remain scheduled." : "Holiday schedule configured per show."}</p></div>)}</section>)}</div>{!districts?.length && <p>No district access assigned.</p>}</>;
}
