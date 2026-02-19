import { createPublicClient } from "@/lib/supabase/public";

type AlertRow = {
  id: string;
  message: string;
  link_url: string | null;
};

export default async function AlertBanner() {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("alerts")
    .select("id, message, link_url")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("[AlertBanner] alert query failed", error);
    return null;
  }

  const alert = ((data || [])[0] || null) as AlertRow | null;
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
