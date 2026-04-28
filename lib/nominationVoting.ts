import { getDateTextInTimeZone } from "@/lib/dates";
import {
  NOMINATION_CATEGORY_LABELS,
  NOMINATION_TIMEZONE,
  type NominationCategory,
} from "@/lib/nominations";

export const VOTING_STATUS_OVERRIDES = ["auto", "force_open", "force_closed"] as const;

export type VotingStatusOverride = (typeof VOTING_STATUS_OVERRIDES)[number];

export const TEACHER_VOTING_GROUPS = [
  "LPC Elementary/Preschool",
  "DG Elementary/Preschool",
  "Union Middle School",
  "Union High School",
] as const;

export const ATHLETE_VOTING_GROUPS = ["7", "8", "9", "10", "11", "12"] as const;

export const OVERALL_VOTING_GROUP = "overall";

export const FINALISTS_PER_GROUP_MAX = 4;

export type VotingSession = {
  id: string;
  district_key: string;
  nomination_id: string;
  category: NominationCategory;
  slug: string;
  title: string;
  open_date: string;
  close_date: string;
  status_override: VotingStatusOverride;
  created_at: string;
};

export function getVotingCategoryNoun(category: NominationCategory) {
  if (category === "athletes") return "Athlete";
  if (category === "teachers") return "Teacher";
  if (category === "leaders") return "Citizen";
  return "Workforce Hero";
}

export function getVotingBannerText(category: NominationCategory) {
  return `Vote for ${getVotingCategoryNoun(category)} of the Month`;
}

export function getVotingSessionDefaultTitle(category: NominationCategory) {
  return `${getVotingCategoryNoun(category)} of the Month Voting`;
}

export function votingSessionIsOpenInCentralTime(session: {
  open_date: string;
  close_date: string;
  status_override: VotingStatusOverride;
}) {
  if (session.status_override === "force_open") return true;
  if (session.status_override === "force_closed") return false;
  const today = getDateTextInTimeZone(new Date(), NOMINATION_TIMEZONE);
  return session.open_date <= today && session.close_date >= today;
}

export function getVotingGroupsForCategory(category: NominationCategory) {
  if (category === "teachers") return [...TEACHER_VOTING_GROUPS];
  if (category === "athletes") return [...ATHLETE_VOTING_GROUPS];
  return [OVERALL_VOTING_GROUP];
}

export function getVotingGroupLabel(category: NominationCategory, groupKey: string) {
  if (category === "athletes") return `Grade ${groupKey}`;
  if (category === "teachers") return groupKey;
  return NOMINATION_CATEGORY_LABELS[category];
}

export function normalizeTeacherVotingGroup(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("lpc") || normalized.includes("la porte")) return "LPC Elementary/Preschool";
  if (normalized.includes("dg") || normalized.includes("dysart-geneseo")) return "DG Elementary/Preschool";
  if (normalized === "ums" || normalized.includes("middle")) return "Union Middle School";
  if (normalized === "uhs" || normalized.includes("high")) return "Union High School";
  return String(value || "").trim();
}

export function normalizeAthleteVotingGroup(value: unknown) {
  const match = String(value || "").match(/\d+/);
  const grade = match?.[0] || "";
  return ATHLETE_VOTING_GROUPS.includes(grade as (typeof ATHLETE_VOTING_GROUPS)[number])
    ? grade
    : "";
}

export function getSubmissionVotingGroup(category: NominationCategory, payload: Record<string, unknown>) {
  if (category === "teachers") return normalizeTeacherVotingGroup(payload.campus);
  if (category === "athletes") return normalizeAthleteVotingGroup(payload.grade);
  return OVERALL_VOTING_GROUP;
}

export function getNomineeName(category: NominationCategory, payload: Record<string, unknown>) {
  if (category === "athletes") return String(payload.athlete_name || "").trim();
  if (category === "teachers") return String(payload.teacher_name || "").trim();
  if (category === "leaders") return String(payload.leader_name || "").trim();
  return String(payload.worker_name || "").trim();
}

export function slugifyVotingSession(category: NominationCategory, openDate: string) {
  const [year, month] = openDate.split("-");
  const base =
    category === "athletes"
      ? "athletes"
      : category === "teachers"
        ? "teachers"
        : category === "leaders"
          ? "citizens"
          : "workforce-heroes";
  return [base, year, month].filter(Boolean).join("-");
}
