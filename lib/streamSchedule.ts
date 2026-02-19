export type StreamConfigRow = {
  id?: string | number;
  is_live: boolean | null;
  stream_id: string | null;
  hls_url: string | null;
  mode: "manual" | "auto" | null;
  timezone: string | null;
};

export type StreamScheduleRow = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean | null;
};

const WEEKDAY_MAP: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function getClockInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  const weekday = WEEKDAY_MAP[(parts.weekday || "").toLowerCase()] ?? 0;
  const hour = Number(parts.hour || "0");
  const minute = Number(parts.minute || "0");
  const second = Number(parts.second || "0");
  return { weekday, hour, minute, second };
}

function minutesFromTimeText(timeText: string) {
  const [h, m] = timeText.split(":").map((value) => Number(value || "0"));
  return h * 60 + m;
}

function isRowActiveNow(row: StreamScheduleRow, weekday: number, minuteOfDay: number) {
  const start = minutesFromTimeText(row.start_time);
  const end = minutesFromTimeText(row.end_time);

  if (start === end) return true;
  if (start < end) {
    return row.day_of_week === weekday && minuteOfDay >= start && minuteOfDay < end;
  }

  // Overnight window (example: 22:00 -> 02:00)
  if (row.day_of_week === weekday && minuteOfDay >= start) return true;
  const previousDay = (weekday + 6) % 7;
  return row.day_of_week === previousDay && minuteOfDay < end;
}

export function isLiveBySchedule(rows: StreamScheduleRow[], timezone: string, now = new Date()) {
  const { weekday, hour, minute } = getClockInTimezone(now, timezone);
  const minuteOfDay = hour * 60 + minute;
  const activeRows = rows.filter((row) => row.is_active !== false);
  return activeRows.some((row) => isRowActiveNow(row, weekday, minuteOfDay));
}

export function getNextStartTimeUTC(
  rows: StreamScheduleRow[],
  timezone: string,
  now = new Date()
) {
  const activeRows = rows.filter((row) => row.is_active !== false);
  if (!activeRows.length) return null;

  const nowMs = now.getTime();
  for (let addDays = 0; addDays < 14; addDays++) {
    const candidate = new Date(nowMs + addDays * 24 * 60 * 60 * 1000);
    const clock = getClockInTimezone(candidate, timezone);

    const dayRows = activeRows.filter((row) => row.day_of_week === clock.weekday);
    if (!dayRows.length) continue;

    for (const row of dayRows.sort((a, b) => a.start_time.localeCompare(b.start_time))) {
      const [startHour, startMinute] = row.start_time
        .split(":")
        .map((value) => Number(value || "0"));

      const wallClock = new Date(candidate);
      wallClock.setUTCMinutes(0, 0, 0);

      const naiveUTC = new Date(
        `${wallClock.getUTCFullYear()}-${String(wallClock.getUTCMonth() + 1).padStart(2, "0")}-${String(
          wallClock.getUTCDate()
        ).padStart(2, "0")}T${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}:00Z`
      );
      const naiveClock = getClockInTimezone(naiveUTC, timezone);
      const deltaMinutes =
        (naiveClock.hour - startHour) * 60 + (naiveClock.minute - startMinute);
      const correctedUTC = new Date(naiveUTC.getTime() - deltaMinutes * 60 * 1000);

      if (correctedUTC.getTime() > nowMs) {
        return correctedUTC.toISOString();
      }
    }
  }

  return null;
}
