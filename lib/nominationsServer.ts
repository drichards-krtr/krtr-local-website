import { createPublicClient } from "@/lib/supabase/public";
import { nominationIsOpenInCentralTime } from "@/lib/nominations";

export type NominationRecord = {
  id: string;
  category: "athletes" | "teachers" | "leaders" | "workforce";
  open_date: string;
  close_date: string;
  status_override: "auto" | "force_open" | "force_closed";
  created_at: string;
};

export async function getCurrentOpenNomination() {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("nominations")
    .select("id, category, open_date, close_date, status_override, created_at")
    .order("open_date", { ascending: false });

  if (error) {
    throw new Error(`[Nominations:getCurrentOpenNomination] ${error.message}`);
  }

  const nominations = (data || []) as NominationRecord[];

  const forceOpen = nominations.find((row) => row.status_override === "force_open");
  if (forceOpen) return forceOpen;

  return nominations.find((row) => nominationIsOpenInCentralTime(row)) || null;
}
