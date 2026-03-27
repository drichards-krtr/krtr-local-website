import { cache } from "react";
import { getDateTextInTimeZone } from "@/lib/dates";
import { createPublicClient } from "@/lib/supabase/public";
import type { DistrictKey } from "@/lib/districts";

type LogoRow = {
  image_url: string;
  description: string | null;
  is_default: boolean;
  start_date: string;
};

export const getPreferredLogo = cache(async function getPreferredLogo(districtKey: DistrictKey) {
  const supabase = createPublicClient();
  const today = getDateTextInTimeZone();
  const { data, error } = await supabase
    .from("logos")
    .select("image_url, description, is_default, start_date")
    .eq("district_key", districtKey)
    .eq("active", true)
    .or(`and(start_date.lte.${today},end_date.gte.${today}),is_default.eq.true`)
    .order("is_default", { ascending: true })
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[logos:getPreferredLogo] Supabase query failed", { districtKey, error });
    return null;
  }

  if (!data?.image_url) {
    return null;
  }

  return data as LogoRow;
});
