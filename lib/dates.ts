export const KRTR_TIMEZONE = "America/Chicago";

function getDateParts(date: Date, timeZone = KRTR_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";

  return { year, month, day };
}

export function getDateTextInTimeZone(date = new Date(), timeZone = KRTR_TIMEZONE) {
  const { year, month, day } = getDateParts(date, timeZone);
  return `${year}-${month}-${day}`;
}

export function formatDateInTimeZone(
  value: string | Date,
  options?: Intl.DateTimeFormatOptions & { timeZone?: string }
) {
  const { timeZone = KRTR_TIMEZONE, ...rest } = options || {};
  const date = value instanceof Date ? value : new Date(value);

  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    ...rest,
  }).format(date);
}
