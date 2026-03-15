export const NOMINATION_TIMEZONE = "America/Chicago";

export const NOMINATION_CATEGORIES = [
  "athletes",
  "teachers",
  "leaders",
  "workforce",
] as const;

export type NominationCategory = (typeof NOMINATION_CATEGORIES)[number];

export const NOMINATION_CATEGORY_LABELS: Record<NominationCategory, string> = {
  athletes: "Athletes of the Month",
  teachers: "Teachers of the Month",
  leaders: "Local Leader of the Month",
  workforce: "Workforce Star of the Month",
};

export function getNominationBannerText(category: NominationCategory) {
  const label = NOMINATION_CATEGORY_LABELS[category];

  if (category === "teachers") {
    return `Nominate Your Teacher for ${label}`;
  }

  if (category === "athletes") {
    return `Nominate Your Athlete for ${label}`;
  }

  return `Nominate Someone You Know for ${label}`;
}

export function isNominationCategory(value: string): value is NominationCategory {
  return NOMINATION_CATEGORIES.includes(value as NominationCategory);
}

export function getCentralDateText(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: NOMINATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

export function nominationIsOpenInCentralTime(nomination: {
  open_date: string;
  close_date: string;
  status_override: "auto" | "force_open" | "force_closed";
}) {
  if (nomination.status_override === "force_open") return true;
  if (nomination.status_override === "force_closed") return false;
  const today = getCentralDateText();
  return nomination.open_date <= today && nomination.close_date >= today;
}
