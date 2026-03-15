import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";

type LogoRow = {
  image_url: string;
  description: string | null;
  is_default: boolean;
  start_date: string;
};

export const getPreferredLogo = cache(async function getPreferredLogo() {
  const supabase = createPublicClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("logos")
    .select("image_url, description, is_default, start_date")
    .eq("active", true)
    .or(`and(start_date.lte.${today},end_date.gte.${today}),is_default.eq.true`)
    .order("is_default", { ascending: true })
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[logos:getPreferredLogo] Supabase query failed", error);
    return null;
  }

  if (!data?.image_url) {
    return null;
  }

  return data as LogoRow;
});
