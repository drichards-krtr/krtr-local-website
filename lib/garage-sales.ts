import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import type { DistrictKey } from "@/lib/districts";
import { getDateTextInTimeZone } from "@/lib/dates";

export type GarageSaleSession = {
  id: string;
  district_key: string;
  slug: string;
  name: string;
  open_date: string;
  close_date: string;
  page_copy: string;
  status: string;
};

export type GarageSaleSubmission = {
  id: string;
  session_id: string;
  address: string;
  date_times: string;
  items: string;
  image_url: string | null;
  created_at: string;
};

export const getOpenGarageSaleSessions = cache(async function getOpenGarageSaleSessions(
  districtKey: DistrictKey
) {
  const supabase = createPublicClient();
  const today = getDateTextInTimeZone();
  const { data, error } = await supabase
    .from("garage_sale_sessions")
    .select("id, district_key, slug, name, open_date, close_date, page_copy, status")
    .eq("district_key", districtKey)
    .eq("status", "active")
    .lte("open_date", today)
    .gte("close_date", today)
    .order("open_date", { ascending: true });

  if (error) {
    console.error("[garage-sales:getOpenGarageSaleSessions] Supabase query failed", {
      districtKey,
      error,
    });
    return [];
  }

  return (data || []) as GarageSaleSession[];
});

export async function getPublishedGarageSaleSubmissions(sessionIds: string[]) {
  if (sessionIds.length === 0) return [] as GarageSaleSubmission[];

  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("garage_sale_submissions")
    .select("id, session_id, address, date_times, items, image_url, created_at")
    .in("session_id", sessionIds)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[garage-sales:getPublishedGarageSaleSubmissions] Supabase query failed", error);
    return [];
  }

  return (data || []) as GarageSaleSubmission[];
}
