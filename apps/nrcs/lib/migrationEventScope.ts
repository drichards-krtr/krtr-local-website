export function migrationEventDay(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function isPastMigrationEvent(startAt: unknown, day: string) {
  const date = String(startAt || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date < day;
}
