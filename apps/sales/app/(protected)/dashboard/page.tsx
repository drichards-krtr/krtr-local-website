import { requireSalesIdentity } from "@/lib/auth";
export default async function Dashboard() {
  const { supabase, isOwner } = await requireSalesIdentity();
  const { data: districts, error } = await supabase.from("sales_districts").select("district_key, name").order("name");
  if (error) throw new Error("District access is unavailable.");
  return <><p className="eyebrow">Your workspace</p><h1>Sales dashboard</h1><p className="notice">Foundation build: sales, bookings, payments, and fulfillment are not available yet.</p><div className="grid"><section className="card"><h2>District access</h2>{districts?.length ? <ul>{districts.map(d => <li key={d.district_key}>{d.name} <span className="badge">{d.district_key.toUpperCase()}</span></li>)}</ul> : <p>No district access assigned. Contact KRTR.</p>}</section><section className="card"><h2>Next build chunk</h2><p>Customers, organization invitations, sales ownership, and pipeline follow-ups.</p>{isOwner && <p>You can configure regions and district assignments now.</p>}</section></div></>;
}
