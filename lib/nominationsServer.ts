import { createPublicClient } from "@/lib/supabase/public";
import { nominationIsOpenInCentralTime } from "@/lib/nominations";
import type { DistrictKey } from "@/lib/districts";

export type NominationRecord = {
  id: string;
  category: "athletes" | "teachers" | "leaders" | "workforce";
  open_date: string;
  close_date: string;
  status_override: "auto" | "force_open" | "force_closed";
  created_at: string;
};

export async function getCurrentOpenNomination(districtKey: DistrictKey) {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("nominations")
    .select("id, category, open_date, close_date, status_override, created_at")
    .eq("district_key", districtKey)
    .order("open_date", { ascending: false });

  if (error) {
    throw new Error(`[Nominations:getCurrentOpenNomination:${districtKey}] ${error.message}`);
  }

  const nominations = (data || []) as NominationRecord[];

  const forceOpen = nominations.find((row) => row.status_override === "force_open");
  if (forceOpen) return forceOpen;

  return nominations.find((row) => nominationIsOpenInCentralTime(row)) || null;
}
