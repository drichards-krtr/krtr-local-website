import { createPublicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

type EventItem = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string | null;
};

function formatEventWindow(startAt: string, endAt: string | null) {
  const start = new Date(startAt);
  if (!endAt) return start.toLocaleString();
  const end = new Date(endAt);
  return `${start.toLocaleString()} - ${end.toLocaleString()}`;
}

export default async function CommunityCalendarPage() {
  const supabase = createPublicClient();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayIso = startOfToday.toISOString();

  const { data, error } = await supabase
    .from("events")
    .select("id, title, description, location, start_at, end_at")
    .eq("status", "published")
    .or(`end_at.gte.${todayIso},and(end_at.is.null,start_at.gte.${todayIso})`)
    .order("start_at", { ascending: true });

  if (error) {
    console.error("[CommunityCalendarPage] events query failed", error);
    throw new Error(`[CommunityCalendarPage] ${error.message}`);
  }

  const events = (data || []) as EventItem[];

  return (
    <main className="mx-auto max-w-site px-4 py-6">
      <section className="rounded-lg bg-white p-6">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">Community Calendar</h1>
          <p className="text-sm text-neutral-600">
            Upcoming community events, sorted by soonest start time.
          </p>
        </header>

        {events.length > 0 ? (
          <div className="grid gap-4">
            {events.map((event) => (
              <article key={event.id} className="rounded border border-neutral-200 p-4">
                <h2 className="text-lg font-semibold">{event.title}</h2>
                <p className="mt-1 text-sm text-neutral-600">
                  {formatEventWindow(event.start_at, event.end_at)}
                </p>
                {event.location && (
                  <p className="mt-1 text-sm text-neutral-700">{event.location}</p>
                )}
                {event.description && (
                  <p className="mt-2 text-sm text-neutral-700">{event.description}</p>
                )}
              </article>
            ))}
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
