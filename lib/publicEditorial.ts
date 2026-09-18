import { unstable_noStore as noStore } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

export type PublicPriorityAlert = { id: string; headline: string; message: string; link_url: string | null; start_at: string | null; end_at: string | null; nrcs_target_type: string; nrcs_target_id: string | null };

export function priorityAlertIsActive(alert: { start_at: string | null; end_at: string | null }, now = new Date()) {
  const instant = (value: string) => Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : value.replace(" ", "T") + "Z");
  return (!alert.start_at || instant(alert.start_at) <= now.getTime()) && (!alert.end_at || now.getTime() < instant(alert.end_at));
}

export async function getPublicPriorityAlert(districtKey: string): Promise<PublicPriorityAlert | null> {
  noStore();
  const db = createPublicClient();
  const { data, error } = await db.from("alerts").select("id,headline,message,link_url,start_at,end_at,nrcs_target_type,nrcs_target_id").eq("district_key", districtKey).eq("active", true).not("nrcs_source_id", "is", null).order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error(`Cannot load Priority Alert: ${error.message}`);
  const alert = (data || []).find(row => priorityAlertIsActive(row));
  if (!alert) return null;
  let link = alert.link_url;
  if (alert.nrcs_target_type === "story" && alert.nrcs_target_id) {
    const { data: story, error: storyError } = await db.from("stories").select("id,slug").eq("district_key", districtKey).eq("id", alert.nrcs_target_id).eq("status", "published").or(`published_at.is.null,published_at.lte.${new Date().toISOString()}`).maybeSingle();
    if (storyError) throw new Error(storyError.message);
    link = story ? `/stories/${story.slug || story.id}` : null;
  } else if (alert.nrcs_target_type === "event" && alert.nrcs_target_id) {
    const { data: event, error: eventError } = await db.from("events").select("id,start_at").eq("district_key", districtKey).eq("id", alert.nrcs_target_id).eq("status", "published").maybeSingle();
    if (eventError) throw new Error(eventError.message);
    if (event) {
      const day = new Date(String(event.start_at).slice(0, 10) + "T12:00:00Z");
      day.setUTCDate(day.getUTCDate() - day.getUTCDay());
      link = `/calendar?${new URLSearchParams({ view: "calendar", selected_event: event.id, week_start: day.toISOString().slice(0, 10) })}`;
    } else link = null;
  }
  return { ...alert, headline: alert.headline || "Priority Alert", link_url: link };
}
