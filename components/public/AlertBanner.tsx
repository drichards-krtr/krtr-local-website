import { createPublicClient } from "@/lib/supabase/public";
import { unstable_noStore as noStore } from "next/cache";

type AlertRow = {
  id: string;
  message: string;
  link_url: string | null;
  active: boolean;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
};

function isActiveNowInChicago(alert: AlertRow) {
  const nowChicago = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })
  );
  const startOk = !alert.start_at || new Date(alert.start_at) <= nowChicago;
  const endOk = !alert.end_at || new Date(alert.end_at) >= nowChicago;
  return alert.active && startOk && endOk;
}

export default async function AlertBanner() {
  noStore();
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("alerts")
    .select("id, message, link_url, active, start_at, end_at, created_at")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[AlertBanner] alert query failed", error);
    return null;
  }

  const alert =
    (((data || []) as AlertRow[]).find((row) => isActiveNowInChicago(row)) || null);
  if (!alert) return null;

  return (
    <div className="bg-krtrRed text-white">
      <div className="mx-auto max-w-site px-4 py-2 text-sm">
        {alert.link_url ? (
          <a href={alert.link_url} className="font-semibold underline">
            {alert.message}
          </a>
        ) : (
          <span className="font-semibold">{alert.message}</span>
        )}
      </div>
    </div>
  );
}
