export function formatNaiveDateTime(value: string | null) {
  if (!value) return "-";
  const match = value.replace(" ", "T").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export const DEFAULT_NRCS_TIMEZONE = "America/Chicago";

function getTimeParts(date: Date, timeZone = DEFAULT_NRCS_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value || "0"),
    month: Number(parts.find((part) => part.type === "month")?.value || "1"),
    day: Number(parts.find((part) => part.type === "day")?.value || "1"),
    hour: Number(parts.find((part) => part.type === "hour")?.value || "0"),
    minute: Number(parts.find((part) => part.type === "minute")?.value || "0"),
    second: Number(parts.find((part) => part.type === "second")?.value || "0"),
  };
}

function getTimeZoneOffsetMilliseconds(date: Date, timeZone = DEFAULT_NRCS_TIMEZONE) {
  const parts = getTimeParts(date, timeZone);
  const zonedUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return zonedUtcMs - date.getTime();
}

export function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone = DEFAULT_NRCS_TIMEZONE
) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offsetMs = getTimeZoneOffsetMilliseconds(utcGuess, timeZone);
  const corrected = new Date(utcGuess.getTime() - offsetMs);
  const correctedOffsetMs = getTimeZoneOffsetMilliseconds(corrected, timeZone);
  return correctedOffsetMs === offsetMs ? corrected : new Date(utcGuess.getTime() - correctedOffsetMs);
}

export function localDateTimeInputToUtcIso(value: string | null | undefined, timeZone = DEFAULT_NRCS_TIMEZONE) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  return zonedDateTimeToUtc(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] || "0"),
    timeZone
  ).toISOString();
}

export function formatDateTimeForInput(value: string | null | undefined, timeZone = DEFAULT_NRCS_TIMEZONE) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = getTimeParts(date, timeZone);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}-${parts.day
    .toString()
    .padStart(2, "0")}T${parts.hour.toString().padStart(2, "0")}:${parts.minute.toString().padStart(2, "0")}`;
}

export function formatDateTimeInTimeZone(value: string | null | undefined, timeZone = DEFAULT_NRCS_TIMEZONE) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function getDateTextInTimeZone(value: string | Date, timeZone = DEFAULT_NRCS_TIMEZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = getTimeParts(date, timeZone);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}-${parts.day
    .toString()
    .padStart(2, "0")}`;
}

export function getDayRangeInTimeZone(dateText: string, timeZone = DEFAULT_NRCS_TIMEZONE) {
  const [yearText, monthText, dayText] = dateText.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const start = zonedDateTimeToUtc(year, month, day, 0, 0, 0, timeZone);
  const end = zonedDateTimeToUtc(year, month, day + 1, 0, 0, 0, timeZone);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}
