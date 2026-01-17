import { createServerSupabase } from "@/lib/supabase/server";

export default async function CmsDashboard() {
  const supabase = createServerSupabase();
  const [stories, ads, events, alerts] = await Promise.all([
    supabase.from("stories").select("id", { count: "exact", head: true }),
    supabase.from("ads").select("id", { count: "exact", head: true }),
    supabase.from("events").select("id", { count: "exact", head: true }),
    supabase.from("alerts").select("id", { count: "exact", head: true }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Stories", count: stories.count || 0 },
          { label: "Ads", count: ads.count || 0 },
          { label: "Events", count: events.count || 0 },
          { label: "Alerts", count: alerts.count || 0 },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-neutral-200 bg-white p-4"
          >
            <p className="text-sm text-neutral-500">{item.label}</p>
            <p className="text-2xl font-semibold">{item.count}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
