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

type EventItem = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string | null;
  image_url: string | null;
  recurrence_group_id: string | null;
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
};

function formatEventWindow(startAt: string, endAt: string | null) {
  if (!endAt) return formatNaiveDateTime(startAt);
  return `${formatNaiveDateTime(startAt)} - ${formatNaiveDateTime(endAt)}`;
}

function includeOnCalendar(event: EventItem, nowText: string, todayDate: string) {
  if (event.end_at) {
    // Keep event visible until it has actually ended.
    return getNaiveDateTimeText(event.end_at) >= nowText;
  }
  // No end time: keep event through the day it starts.
  return getNaiveDateText(event.start_at) >= todayDate;
}

function dedupeRecurringEvents(events: EventItem[]) {
  const seenGroups = new Set<string>();
  const deduped: EventItem[] = [];
  for (const event of events) {
    if (!event.recurrence_group_id) {
      deduped.push(event);
      continue;
    }
    if (seenGroups.has(event.recurrence_group_id)) continue;
    seenGroups.add(event.recurrence_group_id);
    deduped.push(event);
  }
  return deduped;
}

export default async function CommunityCalendarPage({
  searchParams,
}: {
  searchParams: { towns?: string | string[]; include_school_sports?: string | string[] };
}) {
  const supabase = createPublicClient();
  const districtKey = getCurrentDistrictKey();
  const nowText = getDateTimeTextInTimeZone();
  const todayDate = getDateTextInTimeZone();
  const selectedTowns = new Set(
    (Array.isArray(searchParams.towns)
      ? searchParams.towns
      : searchParams.towns
        ? [searchParams.towns]
        : []
    ).map((town) => town.trim()).filter(Boolean)
  );
  const includeSportsParam = searchParams.include_school_sports;
  const includeSchoolSports = Array.isArray(includeSportsParam)
    ? includeSportsParam.includes("on")
    : includeSportsParam
      ? includeSportsParam === "on"
      : true;

  const { data, error } = await supabase
    .from("events")
    .select(
      "id, title, description, location, location_name, address, city, state, zip, start_at, end_at, image_url, recurrence_group_id, link_1_url, link_1_text, link_2_url, link_2_text, is_school_sports"
    )
    .eq("district_key", districtKey)
    .eq("status", "published")
    .order("start_at", { ascending: true });

  if (error) {
    console.error("[CommunityCalendarPage] events query failed", error);
    throw new Error(`[CommunityCalendarPage] ${error.message}`);
  }

  const upcomingEvents = dedupeRecurringEvents(
    ((data || []) as EventItem[]).filter((event) =>
      includeOnCalendar(event, nowText, todayDate)
    )
  );
  const townOptions = Array.from(
    new Set(
      upcomingEvents
        .filter((event) => !event.is_school_sports)
        .map((event) => getEventTown(event))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
  const events = upcomingEvents.filter((event) => {
    if (!includeSchoolSports && event.is_school_sports) return false;
    if (selectedTowns.size === 0) return true;
    return selectedTowns.has(getEventTown(event));
  });

  return (
    <main className="mx-auto max-w-site px-4 py-6">
      <section className="rounded-lg bg-white p-6">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">Community Calendar</h1>
          <p className="text-sm text-neutral-600">
            Upcoming community events, sorted by soonest start time.
          </p>
          <p className="mt-2 text-sm text-neutral-700">
            These are just the events we know about.{" "}
            <a href="/calendar/submit" className="font-semibold underline">
              Click Here
            </a>{" "}
            to submit an event!
          </p>
        </header>

        {(townOptions.length > 0 || upcomingEvents.some((event) => event.is_school_sports)) && (
          <form className="mb-5 rounded border border-neutral-200 bg-neutral-50 p-4">
            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              {townOptions.length > 0 && (
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold">Filter by town</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {townOptions.map((town) => (
                      <label key={town} className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="towns"
                          value={town}
                          defaultChecked={selectedTowns.has(town)}
                        />
                        {town}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">School Sports</legend>
                <input type="hidden" name="include_school_sports" value="off" />
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="include_school_sports"
                    value="on"
                    defaultChecked={includeSchoolSports}
                  />
                  Include school sports
                </label>
                <p className="mt-1 max-w-sm text-xs text-neutral-600">
                  Applies only to official school sports, not little league or other non-school sports.
                </p>
              </fieldset>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
              >
                Apply
              </button>
              {(selectedTowns.size > 0 || !includeSchoolSports) && (
                <a href="/calendar" className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold">
                  Clear
                </a>
              )}
            </div>
          </form>
        )}

        {events.length > 0 ? (
          <div className="grid gap-4">
            {events.map((event) => {
              const links = [
                { url: event.link_1_url?.trim(), text: event.link_1_text?.trim() },
                { url: event.link_2_url?.trim(), text: event.link_2_text?.trim() },
              ].filter((link) => Boolean(link.url));

              const locationLines = formatEventLocation(event);

              return (
                <article key={event.id} className="rounded border border-neutral-200 p-4">
                <h2 className="text-lg font-semibold">{event.title}</h2>
                <p className="mt-1 text-sm text-neutral-600">
                  {formatEventWindow(event.start_at, event.end_at)}
                </p>
                {event.image_url && (
                  <a
                    href={event.image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-block"
                  >
                    <img
                      src={event.image_url}
                      alt=""
                      className="max-h-[250px] max-w-[300px] rounded border border-neutral-200 object-contain"
                    />
                  </a>
                )}
                {locationLines.length > 0 && (
                  <div className="mt-1 text-sm text-neutral-700">
                    {locationLines.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                )}
                {event.description && (
                  <p className="mt-2 text-sm text-neutral-700">{event.description}</p>
                )}
                {links.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                    {links.map((link, index) => (
                      <a
                        key={`${event.id}-link-${index}`}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold underline"
                      >
                        {link.text || link.url}
                      </a>
                    ))}
                  </div>
                )}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-neutral-600">
            No upcoming events are currently listed.
          </p>
        )}
      </section>
    </main>
  );
}
