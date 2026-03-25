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

export function getDateTimeTextInTimeZone(date = new Date(), timeZone = KRTR_TIMEZONE) {
  const parts = getTimeParts(date, timeZone);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}T${parts.hour.toString().padStart(2, "0")}:${parts.minute.toString().padStart(2, "0")}:${parts.second.toString().padStart(2, "0")}`;
}

function getTimeParts(date: Date, timeZone = KRTR_TIMEZONE) {
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

  const year = Number(parts.find((part) => part.type === "year")?.value || "0");
  const month = Number(parts.find((part) => part.type === "month")?.value || "1");
  const day = Number(parts.find((part) => part.type === "day")?.value || "1");
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
  const second = Number(parts.find((part) => part.type === "second")?.value || "0");

  return { year, month, day, hour, minute, second };
}

function getTimeZoneOffsetMilliseconds(date: Date, timeZone = KRTR_TIMEZONE) {
  const parts = getTimeParts(date, timeZone);
  const zonedUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return zonedUtcMs - date.getTime();
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone = KRTR_TIMEZONE
) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offsetMs = getTimeZoneOffsetMilliseconds(utcGuess, timeZone);
  const corrected = new Date(utcGuess.getTime() - offsetMs);
  const correctedOffsetMs = getTimeZoneOffsetMilliseconds(corrected, timeZone);

  if (correctedOffsetMs === offsetMs) {
    return corrected;
  }

  return new Date(utcGuess.getTime() - correctedOffsetMs);
}

export function getDayRangeInTimeZone(dateText: string, timeZone = KRTR_TIMEZONE) {
  const [yearText, monthText, dayText] = dateText.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  const start = zonedDateTimeToUtc(year, month, day, 0, 0, 0, timeZone);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
  const nextDayText = getDateTextInTimeZone(nextDay, "UTC");
  const [nextYearText, nextMonthText, nextDayValueText] = nextDayText.split("-");
  const end = zonedDateTimeToUtc(
    Number(nextYearText),
    Number(nextMonthText),
    Number(nextDayValueText),
    0,
    0,
    0,
    timeZone
  );

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
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

export function formatDateTimeInTimeZone(
  value: string | Date,
  options?: Intl.DateTimeFormatOptions & { timeZone?: string }
) {
  return formatDateInTimeZone(value, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    ...options,
  });
}

function normalizeNaiveDateTimeText(value: string) {
  return value.trim().replace(" ", "T").replace(/\.\d+$/, "");
}

function parseNaiveDateTimeText(value: string) {
  const normalized = normalizeNaiveDateTimeText(value);
  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] || "0"),
    minute: Number(match[5] || "0"),
    second: Number(match[6] || "0"),
  };
}

export function formatNaiveDateTime(
  value: string | null,
  options?: Intl.DateTimeFormatOptions & { includeSeconds?: boolean }
) {
  if (!value) return "-";

  const parts = parseNaiveDateTimeText(value);
  if (!parts) return value;

  const syntheticUtcDate = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  );

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: options?.includeSeconds ? "2-digit" : undefined,
  }).format(syntheticUtcDate);
}

export function formatNaiveDate(value: string | null) {
  if (!value) return "-";

  const parts = parseNaiveDateTimeText(value);
  if (!parts) return value;

  const syntheticUtcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(syntheticUtcDate);
}

export function getNaiveDateText(value: string | null) {
  if (!value) return "";

  const parts = parseNaiveDateTimeText(value);
  if (!parts) return "";

  return `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

export function getNaiveDateTimeText(value: string | null) {
  if (!value) return "";

  const parts = parseNaiveDateTimeText(value);
  if (!parts) return "";

  return `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}T${parts.hour.toString().padStart(2, "0")}:${parts.minute.toString().padStart(2, "0")}:${parts.second.toString().padStart(2, "0")}`;
}
