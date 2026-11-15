import { getHeaderData } from "@/components/public/Header";
import { getFooterSettings } from "@/lib/footer";
import { getCurrentWeather } from "@/lib/weather";
import { createPublicClient } from "@/lib/supabase/public";
import { getDateTimeTextInTimeZone, getNaiveDateTimeText } from "@/lib/dates";
import { getArticleScope } from "@/lib/articleCache";

export async function getArticleChrome(scope: string) {
  const { districtKey, scope: siteScope } = getArticleScope(scope);
  const [header, footer, weather, alerts] = await Promise.all([
    getHeaderData(districtKey, siteScope), getFooterSettings(districtKey),
    getCurrentWeather(districtKey).catch(() => null),
    createPublicClient().from("alerts").select("id,message,link_url,start_at,end_at")
      .eq("district_key", districtKey).is("nrcs_source_id", null).eq("active", true)
      .order("created_at", { ascending: false }).limit(20),
  ]);
  if (alerts.error) throw new Error(`Cannot load article alerts: ${alerts.error.message}`);
  const now = getDateTimeTextInTimeZone();
  const alert = (alerts.data || []).find(row =>
    (!row.start_at || getNaiveDateTimeText(row.start_at) <= now) &&
    (!row.end_at || getNaiveDateTimeText(row.end_at) >= now)) || null;
  return { header, footer, weather, alert };
}
export type ArticleChromeData = Awaited<ReturnType<typeof getArticleChrome>>;
