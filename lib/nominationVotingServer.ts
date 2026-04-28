import type { DistrictKey } from "@/lib/districts";
import {
  type VotingSession,
  votingSessionIsOpenInCentralTime,
} from "@/lib/nominationVoting";
import { createPublicClient } from "@/lib/supabase/public";

export async function getCurrentOpenVotingSession(districtKey: DistrictKey) {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("nomination_voting_sessions")
    .select("id, district_key, nomination_id, category, slug, title, open_date, close_date, status_override, created_at")
    .eq("district_key", districtKey)
    .order("open_date", { ascending: false });

  if (error) {
    throw new Error(`[NominationVoting:getCurrentOpenVotingSession:${districtKey}] ${error.message}`);
  }

  const sessions = (data || []) as VotingSession[];
  const forceOpen = sessions.find((row) => row.status_override === "force_open");
  if (forceOpen) return forceOpen;

  return sessions.find((row) => votingSessionIsOpenInCentralTime(row)) || null;
}
