import Link from "next/link";
import { requireNrcsStaff } from "@/lib/auth";
import { getNrcsDistrictContext } from "@/lib/districts";
import { hasNrcsRoleAtLeast } from "@/lib/roles";
import { createNrcsServerClient } from "@/lib/server";
import { formatLocalDateTime, updateStoryWake } from "@/lib/workflow";
import { FollowUpCreateForm, FollowUpList, type FollowUpRow, type StoryWakeRow } from "@/components/NrcsWorkflowPanels";

type EventRow = {
  id: string;
  title: string;
  start_at: string;
  status: string;
};

type StoryRow = {
  id: string;
  title: string;
  lifecycle_state: string;
  updated_at: string;
};

type IntakeRow = {
  id: string;
  intake_type: string;
  title: string;
  status: string;
  created_at: string;
};

type RecentRow = {
  object_type: string;
  object_id: string;
  title: string;
  href: string;
  viewed_at: string;
};

export default async function NrcsDashboardPage() {
  const { profile } = await requireNrcsStaff();
  const { activeDistrict, allowedDistricts } = await getNrcsDistrictContext();
  const districtKey = activeDistrict?.district_key || "dlpc";
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const sevenDays = new Date(now);
  sevenDays.setDate(sevenDays.getDate() + 7);
  const supabase = await createNrcsServerClient();
  const canManageIntake = hasNrcsRoleAtLeast(profile.role, "editor");

  const [
    { data: followUps },
    { data: triggeredWakes },
    { data: todaysEvents },
    { data: upcomingEvents },
    { data: recentStories },
    { data: recentItems },
    intakeResult,
  ] = await Promise.all([
    supabase
      .from("nrcs_follow_ups")
      .select("id, district_key, title, description, due_at, status, context_label, context_type, context_id")
      .eq("district_key", districtKey)
      .in("status", ["open", "in_progress"])
      .lte("due_at", endOfToday.toISOString())
      .order("due_at", { ascending: true })
      .limit(10),
    supabase
      .from("nrcs_story_wakes")
      .select("id, story_id, wake_at, reason, status, nrcs_stories(id, title, district_key)")
      .eq("status", "active")
      .lte("wake_at", now.toISOString())
      .order("wake_at", { ascending: true })
      .limit(10),
    supabase
      .from("nrcs_events")
      .select("id, title, start_at, status")
      .eq("district_key", districtKey)
      .gte("start_at", startOfToday.toISOString())
      .lte("start_at", endOfToday.toISOString())
      .order("start_at", { ascending: true })
      .limit(10),
    supabase
      .from("nrcs_events")
      .select("id, title, start_at, status")
      .eq("district_key", districtKey)
      .gt("start_at", endOfToday.toISOString())
      .lte("start_at", sevenDays.toISOString())
      .order("start_at", { ascending: true })
      .limit(10),
    supabase
      .from("nrcs_stories")
      .select("id, title, lifecycle_state, updated_at")
      .eq("district_key", districtKey)
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("nrcs_recent_items")
      .select("object_type, object_id, title, href, viewed_at")
      .order("viewed_at", { ascending: false })
      .limit(8),
    canManageIntake
      ? supabase
          .from("nrcs_intake_items")
          .select("id, intake_type, title, status, created_at")
          .eq("district_key", districtKey)
          .in("status", ["new", "in_review"])
          .order("created_at", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [] as IntakeRow[], error: null }),
  ]);

  const dashboardFollowUps = (followUps || []) as FollowUpRow[];
  const wakes = (triggeredWakes || []) as Array<StoryWakeRow & { nrcs_stories?: { id: string; title: string; district_key: string } | Array<{ id: string; title: string; district_key: string }> | null }>;
  const intake = (intakeResult.data || []) as IntakeRow[];

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">NRCS Dashboard</h1>
          <p className="text-sm text-neutral-500">
            Needs Attention, Today, Upcoming, and Recent Work for {activeDistrict?.display_name || districtKey.toUpperCase()}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/stories/new" className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">New Story</Link>
          <Link href="/events/new" className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">New Event</Link>
          <Link href="/follow-ups" className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold">Follow-Ups</Link>
        </div>
      </header>

      <section className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Access Status</h2>
        <dl className="mt-3 grid gap-3 text-sm md:grid-cols-4">
          <div>
            <dt className="text-neutral-500">User</dt>
            <dd className="font-medium">{profile.email}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Role</dt>
            <dd className="font-medium capitalize">{profile.role}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">District Access</dt>
            <dd className="font-medium">{allowedDistricts.map((district) => district.district_key.toUpperCase()).join(", ") || "None"}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Primary Contact</dt>
            <dd className="font-medium">{activeDistrict?.primary_contact_name || "-"}</dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <section className="grid gap-4">
          <h2 className="text-lg font-semibold">Needs Attention</h2>
          {wakes.length > 0 && (
            <div className="grid gap-3">
              {wakes.map((wake) => {
                const story = Array.isArray(wake.nrcs_stories) ? wake.nrcs_stories[0] : wake.nrcs_stories;
                return (
                  <article key={wake.id} className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{story?.title || "Story Wake"}</h3>
                        <p>Woke at {formatLocalDateTime(wake.wake_at)}</p>
                        {wake.reason && <p className="mt-1">{wake.reason}</p>}
                      </div>
                      {story && <Link href={`/stories/${story.id}?district=${story.district_key}`} className="font-semibold underline">Open</Link>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <form action={updateStoryWake}>
                        <input type="hidden" name="wake_id" value={wake.id} />
                        <input type="hidden" name="wake_action" value="snooze" />
                        <input type="hidden" name="snooze_preset" value="tomorrow" />
                        <input type="hidden" name="return_to" value="/dashboard" />
                        <button className="rounded border border-amber-400 px-3 py-1 font-semibold">Snooze</button>
                      </form>
                      <form action={updateStoryWake}>
                        <input type="hidden" name="wake_id" value={wake.id} />
                        <input type="hidden" name="wake_action" value="activate" />
                        <input type="hidden" name="return_to" value="/dashboard" />
                        <button className="rounded border border-amber-400 px-3 py-1 font-semibold">Activate</button>
                      </form>
                      <form action={updateStoryWake}>
                        <input type="hidden" name="wake_id" value={wake.id} />
                        <input type="hidden" name="wake_action" value="close" />
                        <input type="hidden" name="return_to" value="/dashboard" />
                        <button className="rounded border border-amber-400 px-3 py-1 font-semibold">Close</button>
                      </form>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <FollowUpList followUps={dashboardFollowUps} profile={profile} returnTo="/dashboard" />
        </section>

        <section className="grid gap-4">
          <h2 className="text-lg font-semibold">Quick Follow-Up</h2>
          <FollowUpCreateForm districtKey={districtKey} returnTo="/dashboard" />
        </section>
      </div>

      {canManageIntake && (
        <section className="grid gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Intake</h2>
            <Link href="/intake" className="text-sm font-semibold underline">View Queue</Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {intake.map((item) => (
              <Link key={item.id} href={`/intake?district=${districtKey}&status=${item.status}`} className="rounded border border-neutral-200 bg-white p-4 text-sm">
                <div className="font-semibold">{item.title}</div>
                <div className="mt-1 capitalize text-neutral-500">{item.intake_type.replace("_", " ")} - {item.status.replace("_", " ")}</div>
              </Link>
            ))}
            {intake.length === 0 && <p className="rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-500">No active intake items.</p>}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Today</h2>
          {((todaysEvents || []) as EventRow[]).map((event) => (
            <Link key={event.id} href={`/events/${event.id}?district=${districtKey}`} className="rounded border border-neutral-200 bg-white p-4 text-sm">
              <span className="font-semibold">{event.title}</span>
              <span className="ml-2 text-neutral-500">{formatLocalDateTime(event.start_at)}</span>
            </Link>
          ))}
          {(todaysEvents || []).length === 0 && <p className="rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-500">No events scheduled today.</p>}
        </section>

        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Upcoming</h2>
          {((upcomingEvents || []) as EventRow[]).map((event) => (
            <Link key={event.id} href={`/events/${event.id}?district=${districtKey}`} className="rounded border border-neutral-200 bg-white p-4 text-sm">
              <span className="font-semibold">{event.title}</span>
              <span className="ml-2 text-neutral-500">{formatLocalDateTime(event.start_at)}</span>
            </Link>
          ))}
          {(upcomingEvents || []).length === 0 && <p className="rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-500">No upcoming events in the next week.</p>}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Recent Work</h2>
          {((recentStories || []) as StoryRow[]).map((story) => (
            <Link key={story.id} href={`/stories/${story.id}?district=${districtKey}`} className="rounded border border-neutral-200 bg-white p-4 text-sm">
              <span className="font-semibold">{story.title}</span>
              <span className="ml-2 capitalize text-neutral-500">{story.lifecycle_state}</span>
            </Link>
          ))}
        </section>

        <section className="grid gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recently Opened</h2>
            <Link href="/search" className="text-sm font-semibold underline">Search</Link>
          </div>
          {((recentItems || []) as RecentRow[]).map((item) => (
            <Link key={`${item.object_type}-${item.object_id}`} href={item.href} className="rounded border border-neutral-200 bg-white p-4 text-sm">
              <span className="font-semibold">{item.title}</span>
              <span className="ml-2 capitalize text-neutral-500">{item.object_type.replace("_", " ")}</span>
            </Link>
          ))}
          {(recentItems || []).length === 0 && <p className="rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-500">Open a Story or Event to start recent tracking.</p>}
        </section>
      </div>
    </div>
  );
}
