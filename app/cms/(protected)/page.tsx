import { createServerSupabase } from "@/lib/supabase/server";
import {
  getDateTextInTimeZone,
  getDateTimeTextInTimeZone,
  getDayRangeInTimeZone,
  getNaiveDateTimeText,
} from "@/lib/dates";

export default async function CmsDashboard() {
  const supabase = createServerSupabase();
  const todayDate = getDateTextInTimeZone();
  const { startIso: todayStartIso, endIso: tomorrowStartIso } = getDayRangeInTimeZone(todayDate);

  const [
    storiesTotal,
    storiesPublished,
    storiesDraft,
    storiesUnpublished,
    adsTotal,
    adsAllsiteActive,
    adsHomepageActive,
    adsStoryActive,
    eventsTotal,
    eventsFromToday,
    alertsActive,
    alertsActiveRows,
    streamEntriesTotal,
    streamEntriesEnabled,
    analyticsTodayTotal,
    analyticsTodayActive,
  ] = await Promise.all([
    supabase.from("stories").select("id", { count: "exact", head: true }),
    supabase
      .from("stories")
      .select("id", { count: "exact", head: true })
      .eq("status", "published"),
    supabase
      .from("stories")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft"),
    supabase
      .from("stories")
      .select("id", { count: "exact", head: true })
      .eq("status", "archived"),
    supabase.from("ads").select("id", { count: "exact", head: true }),
    supabase
      .from("ads")
      .select("id", { count: "exact", head: true })
      .eq("placement", "allsite")
      .eq("active", true),
    supabase
      .from("ads")
      .select("id", { count: "exact", head: true })
      .eq("placement", "homepage")
      .eq("active", true),
    supabase
      .from("ads")
      .select("id", { count: "exact", head: true })
      .eq("placement", "story")
      .eq("active", true),
    supabase.from("events").select("id", { count: "exact", head: true }),
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .gte("start_at", todayStartIso),
    supabase
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .eq("active", true),
    supabase.from("alerts").select("start_at, end_at").eq("active", true),
    supabase.from("stream_schedule").select("id", { count: "exact", head: true }),
    supabase
      .from("stream_schedule")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("analytics_sessions")
      .select("session_id", { count: "exact", head: true })
      .gte("started_at", todayStartIso)
      .lt("started_at", tomorrowStartIso),
    supabase
      .from("analytics_sessions")
      .select("session_id", { count: "exact", head: true })
      .gte("started_at", todayStartIso)
      .lt("started_at", tomorrowStartIso)
      .is("ended_at", null),
  ]);

  const nowChicago = getDateTimeTextInTimeZone();
  const activeNowAlerts =
    (alertsActiveRows.data || []).filter((alert) => {
      const startOk = !alert.start_at || getNaiveDateTimeText(alert.start_at) <= nowChicago;
      const endOk = !alert.end_at || getNaiveDateTimeText(alert.end_at) >= nowChicago;
      return startOk && endOk;
    }).length || 0;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[
          {
            label: "Stories",
            rows: [
              ["Total", storiesTotal.count || 0],
              ["Published", storiesPublished.count || 0],
              ["Draft", storiesDraft.count || 0],
              ["Unpublished", storiesUnpublished.count || 0],
            ],
          },
          {
            label: "Ads",
            rows: [
              ["Total", adsTotal.count || 0],
              ["Active All-Site", adsAllsiteActive.count || 0],
              ["Active Homepage", adsHomepageActive.count || 0],
              ["Active Story", adsStoryActive.count || 0],
            ],
          },
          {
            label: "Events",
            rows: [
              ["Total", eventsTotal.count || 0],
              ["Today Onward", eventsFromToday.count || 0],
            ],
          },
          {
            label: "Alerts",
            rows: [
              ["Active", alertsActive.count || 0],
              ["Active Now", activeNowAlerts],
            ],
          },
          {
            label: "Stream Config",
            rows: [
              ["Entries", streamEntriesTotal.count || 0],
              ["Enabled", streamEntriesEnabled.count || 0],
            ],
          },
          {
            label: "Analytics (Today Chicago)",
            rows: [
              ["Total Sessions", analyticsTodayTotal.count || 0],
              ["Active Sessions", analyticsTodayActive.count || 0],
            ],
          },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border border-neutral-200 bg-white p-4">
            <p className="mb-3 text-sm text-neutral-500">{card.label}</p>
            <div className="grid gap-1 text-sm">
              {card.rows.map(([name, value]) => (
                <div key={name} className="flex items-center justify-between gap-3">
                  <span className="text-neutral-600">{name}</span>
                  <span className="font-semibold tabular-nums">{value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
