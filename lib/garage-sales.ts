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
  sale_start_date: string;
  sale_end_date: string;
  page_copy: string;
  status: string;
  city: string;
  state: string;
  zip: string;
  map_enabled: boolean;
};

export type GarageSaleSubmissionDate = {
  sale_date: string;
  start_time: string;
  end_time: string;
};

export type GarageSaleSubmission = {
  id: string;
  session_id: string;
  address: string;
  date_times: string;
  items: string;
  image_url: string | null;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  geocode_status: string;
  garage_sale_submission_dates?: GarageSaleSubmissionDate[];
};

export const getOpenGarageSaleSessions = cache(async function getOpenGarageSaleSessions(
  districtKey: DistrictKey
) {
  const supabase = createPublicClient();
  const today = getDateTextInTimeZone();
  const { data, error } = await supabase
    .from("garage_sale_sessions")
    .select("id, district_key, slug, name, open_date, close_date, sale_start_date, sale_end_date, page_copy, status, city, state, zip, map_enabled")
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

export async function getPublishedGarageSaleSubmissions(sessionIds: string[], saleDate?: string) {
  if (sessionIds.length === 0) return [] as GarageSaleSubmission[];

  const supabase = createPublicClient();
  let query = supabase
    .from("garage_sale_submissions")
    .select(
      "id, session_id, address, date_times, items, image_url, created_at, latitude, longitude, geocode_status, garage_sale_submission_dates(sale_date, start_time, end_time)"
    )
    .in("session_id", sessionIds)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (saleDate) {
    query = query.eq("garage_sale_submission_dates.sale_date", saleDate);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[garage-sales:getPublishedGarageSaleSubmissions] Supabase query failed", error);
    return [];
  }

  const submissions = (data || []) as GarageSaleSubmission[];
  if (!saleDate) return submissions;

  return submissions.filter((submission) =>
    (submission.garage_sale_submission_dates || []).some((entry) => entry.sale_date === saleDate)
  );
}
