import { createPublicClient } from "@/lib/supabase/public";
import {
  formatNaiveDateTime,
  getDateTextInTimeZone,
  getDateTimeTextInTimeZone,
  getNaiveDateText,
  getNaiveDateTimeText,
} from "@/lib/dates";
import { getCurrentDistrictKey } from "@/lib/districtServer";
import { formatEventLocation, getEventTown } from "@/lib/events";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const FILTER_LOOKAHEAD_LIMIT = 500;

type ClassificationKind = "sport" | "extra_curricular" | "event_type";

type ClassificationTerm = {
  id: string;
  kind: ClassificationKind;
  name: string;
  enabled: boolean;
};

type EventItem = {
  id: string;
  title: string;
  description: string | null;
  body_html: string | null;
  location: string | null;
  start_at: string;
  end_at: string | null;
  image_url: string | null;
  link_1_url: string | null;
  link_1_text: string | null;
  link_2_url: string | null;
  link_2_text: string | null;
  location_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  is_school_sports: boolean;
  event_classification_assignments?: Array<{
    event_classification_terms: ClassificationTerm | ClassificationTerm[] | null;
  }>;
};

function includeOnCalendar(event: EventItem, nowText: string, todayDate: string) {
  if (event.end_at) return getNaiveDateTimeText(event.end_at) >= nowText;
  return getNaiveDateText(event.start_at) >= todayDate;
}

function getClassification(event: EventItem) {
  const term = event.event_classification_assignments?.[0]?.event_classification_terms || null;
  return Array.isArray(term) ? term[0] || null : term;
}

function getParamSet(value: string | string[] | undefined) {
  return new Set((Array.isArray(value) ? value : value ? [value] : []).map((item) => item.trim()).filter(Boolean));
}

function getLastParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[value.length - 1] : value;
}

function withParams(base: Record<string, string | string[] | undefined>, next: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(base)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const entry of value) params.append(key, entry);
    } else {
      params.set(key, value);
    }
  }
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) params.delete(key);
    else params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `/calendar?${query}` : "/calendar";
}

function splitGenderPrefix(name: string) {
  const match = /^(Boys|Girls)\s+(.+)$/i.exec(name.trim());
  if (!match) return { base: name.trim(), genderRank: 0 };
  return { base: match[2], genderRank: match[1].toLowerCase() === "boys" ? 1 : 2 };
}

function compareTermNames(a: string, b: string) {
  const left = splitGenderPrefix(a);
  const right = splitGenderPrefix(b);
  const base = left.base.localeCompare(right.base);
  if (base !== 0) return base;
  if (left.genderRank !== right.genderRank) return left.genderRank - right.genderRank;
  return a.localeCompare(b);
}

function formatEventWindow(startAt: string, endAt: string | null) {
  if (!endAt) return formatNaiveDateTime(startAt);
  return `${formatNaiveDateTime(startAt)} - ${formatNaiveDateTime(endAt)}`;
}

function startOfCurrentWeekSunday(dateText: string) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

function addDays(dateText: string, days: number) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function formatTime(value: string) {
  const match = value.replace(" ", "T").match(/T(\d{2}):(\d{2})/);
  if (!match) return "";
  const date = new Date(Date.UTC(2000, 0, 1, Number(match[1]), Number(match[2])));
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" }).format(date);
}

function eventMatchesFilters(
  event: EventItem,
  selectedTowns: Set<string>,
  selectedSports: Set<string>,
  selectedActivities: Set<string>,
  selectedEventType: string,
  includeSchoolSports: boolean
) {
  const term = getClassification(event);
  const isSchoolSport = event.is_school_sports || term?.kind === "sport";
  if (!includeSchoolSports && isSchoolSport) return false;
  if (selectedSports.size > 0 && (!term || term.kind !== "sport" || !selectedSports.has(term.name))) return false;
  if (selectedActivities.size > 0 && (!term || term.kind !== "extra_curricular" || !selectedActivities.has(term.name))) return false;
  if (selectedEventType && (!term || term.kind !== "event_type" || term.name !== selectedEventType)) return false;
  if (selectedTowns.size > 0 && !selectedTowns.has(getEventTown(event))) return false;
  return true;
}

function renderEventDetails(event: EventItem) {
  const links = [
    { url: event.link_1_url?.trim(), text: event.link_1_text?.trim() },
    { url: event.link_2_url?.trim(), text: event.link_2_text?.trim() },
  ].filter((link) => Boolean(link.url));
  const locationLines = formatEventLocation(event);
  const term = getClassification(event);

  return (
    <div className="grid gap-3">
      {event.image_url && (
        <a href={event.image_url} target="_blank" rel="noreferrer" className="inline-block">
          <img src={event.image_url} alt="" className="max-h-[250px] max-w-[300px] rounded border border-neutral-200 object-contain" />
        </a>
      )}
      <div className="text-sm text-neutral-600">{formatEventWindow(event.start_at, event.end_at)}</div>
      {term && <div className="text-sm font-medium">{term.name}</div>}
      {locationLines.length > 0 && (
        <div className="text-sm text-neutral-700">
          {locationLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
      {event.body_html ? (
        <div className="event-rich-text text-sm text-neutral-700" dangerouslySetInnerHTML={{ __html: event.body_html }} />
      ) : event.description ? (
        <p className="text-sm text-neutral-700">{event.description}</p>
      ) : null}
      {!event.body_html && links.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {links.map((link, index) => (
            <a key={`${event.id}-link-${index}`} href={link.url} target="_blank" rel="noreferrer" className="font-semibold underline">
              {link.text || link.url}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function CommunityCalendarPage({
  searchParams,
}: {
  searchParams?: Promise<{
    towns?: string | string[];
    sports?: string | string[];
    activities?: string | string[];
    event_type?: string;
    view?: string;
    offset?: string;
    week_start?: string;
    weeks?: string;
    selected_event?: string;
    include_school_sports?: string | string[];
  }>;
}) {
  const resolvedSearchParams = (await searchParams) || {};
  const supabase = createPublicClient();
  const districtKey = await getCurrentDistrictKey();
  const nowText = getDateTimeTextInTimeZone();
  const todayDate = getDateTextInTimeZone();
  const selectedTowns = getParamSet(resolvedSearchParams.towns);
  const selectedSports = getParamSet(resolvedSearchParams.sports);
  const selectedActivities = getParamSet(resolvedSearchParams.activities);
  const selectedEventType = String(resolvedSearchParams.event_type || "");
  const includeSchoolSports = getLastParam(resolvedSearchParams.include_school_sports) !== "0";
  const view = resolvedSearchParams.view === "calendar" ? "calendar" : "list";
  const offset = Math.max(0, Number(resolvedSearchParams.offset || "0") || 0);
  const weeks = resolvedSearchParams.weeks === "4" ? 4 : 1;
  const weekStart = resolvedSearchParams.week_start || startOfCurrentWeekSunday(todayDate);
  const selectedEventId = String(resolvedSearchParams.selected_event || "");
  const selectColumns =
      "id, title, description, body_html, location, location_name, address, city, state, zip, start_at, end_at, image_url, link_1_url, link_1_text, link_2_url, link_2_text, is_school_sports, event_classification_assignments(event_classification_terms(id, kind, name, enabled))";

  const { data, error } = await supabase
    .from("events")
    .select(selectColumns)
    .eq("district_key", districtKey)
    .eq("status", "published")
    .order("start_at", { ascending: true })
    .limit(FILTER_LOOKAHEAD_LIMIT);

  if (error) {
    console.error("[CommunityCalendarPage] events query failed", error);
    throw new Error(`[CommunityCalendarPage] ${error.message}`);
  }

  const upcomingEvents = ((data || []) as unknown as EventItem[]).filter((event) => includeOnCalendar(event, nowText, todayDate));
  const townOptions = Array.from(
    new Set(
      upcomingEvents
        .filter((event) => {
          const term = getClassification(event);
          return (!term || term.kind === "event_type") && !event.is_school_sports;
        })
        .map((event) => getEventTown(event))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
  const termOptions = upcomingEvents.reduce(
    (options, event) => {
      const term = getClassification(event);
      if (term) options[term.kind].add(term.name);
      return options;
    },
    { sport: new Set<string>(), extra_curricular: new Set<string>(), event_type: new Set<string>() }
  );
  const sportOptions = Array.from(termOptions.sport).sort(compareTermNames);
  const activityOptions = Array.from(termOptions.extra_curricular).sort(compareTermNames);
  const eventTypeOptions = Array.from(termOptions.event_type).sort(compareTermNames);
  const hasSchoolSports = upcomingEvents.some((event) => {
    const term = getClassification(event);
    return event.is_school_sports || term?.kind === "sport";
  });
  const filteredEvents = upcomingEvents.filter((event) =>
    eventMatchesFilters(
      event,
      selectedTowns,
      selectedSports,
      selectedActivities,
      selectedEventType,
      includeSchoolSports
    )
  );
  const pageEvents = view === "list" ? filteredEvents.slice(0, offset + PAGE_SIZE) : filteredEvents;
  const hasMore = view === "list" && filteredEvents.length > offset + PAGE_SIZE;
  const calendarStart = weekStart;
  const calendarEnd = addDays(calendarStart, weeks * 7);
  const calendarEvents = filteredEvents.filter((event) => {
    const date = getNaiveDateText(event.start_at);
    return date >= calendarStart && date < calendarEnd;
  });
  const calendarDays = Array.from({ length: weeks * 7 }, (_value, index) => addDays(calendarStart, index));
  const selectedCalendarEvent =
    view === "calendar" && selectedEventId
      ? calendarEvents.find((event) => event.id === selectedEventId) || null
      : null;

  return (
    <main className="mx-auto max-w-site px-4 py-6">
      <section className="rounded-lg bg-white p-6">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">Community Calendar</h1>
          <p className="text-sm text-neutral-600">Upcoming community events, sorted by soonest start time.</p>
          <p className="mt-2 text-sm text-neutral-700">
            These are just the events we know about. <a href="/calendar/submit" className="font-semibold underline">Click Here</a> to submit an event!
          </p>
        </header>

        <form className="mb-5 rounded border border-neutral-200 bg-neutral-50 p-4">
          <input type="hidden" name="view" value={view} />
          <div className="grid gap-4 md:grid-cols-2">
            {townOptions.length > 0 && (
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">Filter by town</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {townOptions.map((town) => (
                    <label key={town} className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" name="towns" value={town} defaultChecked={selectedTowns.has(town)} />
                      {town}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {sportOptions.length > 0 && (
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">Filter by sport</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {sportOptions.map((sport) => (
                    <label key={sport} className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" name="sports" value={sport} defaultChecked={selectedSports.has(sport)} />
                      {sport}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {activityOptions.length > 0 && (
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">Filter by activity</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {activityOptions.map((activity) => (
                    <label key={activity} className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" name="activities" value={activity} defaultChecked={selectedActivities.has(activity)} />
                      {activity}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {eventTypeOptions.length > 0 && (
              <label className="grid gap-2 text-sm">
                <span className="font-semibold">Filter by event type</span>
                <select name="event_type" defaultValue={selectedEventType} className="w-fit rounded border border-neutral-300 bg-white px-3 py-2">
                  <option value="">All</option>
                  {eventTypeOptions.map((eventType) => (
                    <option key={eventType} value={eventType}>{eventType}</option>
                  ))}
                </select>
              </label>
            )}
            {hasSchoolSports && (
              <label className="inline-flex items-center gap-2 text-sm font-medium">
                <input type="hidden" name="include_school_sports" value="0" />
                <input
                  type="checkbox"
                  name="include_school_sports"
                  value="1"
                  defaultChecked={includeSchoolSports}
                />
                Include school sports
              </label>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="submit" className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">Apply</button>
            <a href="/calendar" className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold">Clear</a>
          </div>
        </form>

        <div className="mb-5 flex flex-wrap gap-3">
          <a href={withParams(resolvedSearchParams, { view: "list", offset: 0, selected_event: undefined })} className={`rounded px-3 py-2 text-sm font-semibold ${view === "list" ? "bg-neutral-900 text-white" : "border border-neutral-300"}`}>List</a>
          <a href={withParams(resolvedSearchParams, { view: "calendar", offset: 0, week_start: calendarStart, selected_event: undefined })} className={`rounded px-3 py-2 text-sm font-semibold ${view === "calendar" ? "bg-neutral-900 text-white" : "border border-neutral-300"}`}>Calendar</a>
          {view === "calendar" && (
            <>
              <a href={withParams(resolvedSearchParams, { week_start: addDays(calendarStart, -7), selected_event: undefined })} className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold">Previous</a>
              <a href={withParams(resolvedSearchParams, { week_start: addDays(calendarStart, 7), selected_event: undefined })} className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold">Next</a>
              <a href={withParams(resolvedSearchParams, { weeks: 1, selected_event: undefined })} className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold">1 Week</a>
              <a href={withParams(resolvedSearchParams, { weeks: 4, selected_event: undefined })} className="hidden rounded border border-neutral-300 px-3 py-2 text-sm font-semibold md:inline-block">4 Weeks</a>
            </>
          )}
        </div>

        {view === "list" ? (
          pageEvents.length > 0 ? (
            <div className="grid gap-4">
              {pageEvents.map((event, index) => (
                <article key={event.id} id={`event-${index}`} className="scroll-mt-6 rounded border border-neutral-200 p-4">
                  <h2 className="text-lg font-semibold">{event.title}</h2>
                  {renderEventDetails(event)}
                </article>
              ))}
              {hasMore && (
                <a href={`${withParams(resolvedSearchParams, { view: "list", offset: offset + PAGE_SIZE })}#event-${offset + PAGE_SIZE}`} className="w-fit rounded border border-neutral-300 px-4 py-2 text-sm font-semibold">Load more</a>
              )}
            </div>
          ) : (
            <p className="text-sm text-neutral-600">No upcoming events are currently listed.</p>
          )
        ) : (
          <>
            <div className={`grid gap-2 ${weeks === 4 ? "md:grid-cols-7" : "grid-cols-1 md:grid-cols-7"}`}>
              {calendarDays.map((day) => {
                const dayEvents = calendarEvents.filter((event) => getNaiveDateText(event.start_at) === day);
                return (
                  <div key={day} className="min-h-[120px] rounded border border-neutral-200 p-3">
                    <div className="mb-2 text-sm font-semibold">{day}</div>
                    <div className="grid gap-2">
                      {dayEvents.map((event) => (
                        <a
                          key={event.id}
                          href={withParams(resolvedSearchParams, {
                            view: "calendar",
                            week_start: calendarStart,
                            selected_event: event.id,
                          })}
                          className="rounded bg-neutral-50 p-2 text-sm font-medium hover:bg-neutral-100"
                        >
                          {formatTime(event.start_at)} {event.title}
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {selectedCalendarEvent && (
              <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 py-6">
                <a
                  href={withParams(resolvedSearchParams, { selected_event: undefined })}
                  className="absolute inset-0"
                  aria-label="Close event details"
                />
                <article className="relative z-10 max-h-[85vh] w-full max-w-2xl overflow-auto rounded bg-white p-5 shadow-xl">
                  <header className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold">{selectedCalendarEvent.title}</h2>
                      <p className="mt-1 text-sm text-neutral-600">
                        {formatTime(selectedCalendarEvent.start_at)} on {getNaiveDateText(selectedCalendarEvent.start_at)}
                      </p>
                    </div>
                    <a
                      href={withParams(resolvedSearchParams, { selected_event: undefined })}
                      className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
                    >
                      Close
                    </a>
                  </header>
                  {renderEventDetails(selectedCalendarEvent)}
                </article>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
