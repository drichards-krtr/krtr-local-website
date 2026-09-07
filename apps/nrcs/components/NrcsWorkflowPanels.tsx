import Link from "next/link";
import {
  addFollowUpNote,
  createFollowUpFromForm,
  createStoryWake,
  formatLocalDateTime,
  updateFollowUpStatus,
  updateStoryWake,
} from "@/lib/workflow";
import { hasNrcsRoleAtLeast, type NrcsStaffProfile } from "@/lib/roles";

export type FollowUpRow = {
  id: string;
  district_key: string;
  title: string;
  description: string | null;
  due_at: string;
  status: string;
  context_label: string | null;
  context_type: string | null;
  context_id: string | null;
};

export type FollowUpLogRow = {
  id: string;
  follow_up_id: string;
  activity_type: string;
  note: string;
  happened_at: string;
  backdated: boolean;
};

export type StoryWakeRow = {
  id: string;
  story_id: string;
  wake_at: string;
  reason: string | null;
  status: string;
};

export function FollowUpCreateForm({
  contextId,
  contextLabel,
  contextType,
  districtKey,
  originCopyVersionId,
  returnTo,
}: {
  contextId?: string;
  contextLabel?: string;
  contextType?: string;
  districtKey: string;
  originCopyVersionId?: string | null;
  returnTo: string;
}) {
  return (
    <form
      action={async (formData) => {
        "use server";
        await createFollowUpFromForm(formData, returnTo);
      }}
      className="grid gap-3 rounded border border-neutral-200 bg-white p-4"
    >
      <input type="hidden" name="district_key" value={districtKey} />
      <input type="hidden" name="context_type" value={contextType || ""} />
      <input type="hidden" name="context_id" value={contextId || ""} />
      <input type="hidden" name="context_label" value={contextLabel || ""} />
      <input type="hidden" name="origin_copy_version_id" value={originCopyVersionId || ""} />
      <h3 className="font-semibold">New Follow-Up</h3>
      <input name="title" required placeholder="Follow-Up title" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      <textarea name="description" placeholder="Details" className="min-h-[80px] rounded border border-neutral-300 px-3 py-2 text-sm" />
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Due Date</span>
          <input name="due_date" required type="date" className="rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Due Time</span>
          <input name="due_time" type="time" className="rounded border border-neutral-300 px-3 py-2" />
        </label>
      </div>
      <textarea name="note" placeholder="Opening note" className="min-h-[70px] rounded border border-neutral-300 px-3 py-2 text-sm" />
      <button className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Create Follow-Up</button>
    </form>
  );
}

export function FollowUpList({
  followUps,
  logsByFollowUp,
  profile,
  returnTo,
}: {
  followUps: FollowUpRow[];
  logsByFollowUp?: Map<string, FollowUpLogRow[]>;
  profile: NrcsStaffProfile;
  returnTo: string;
}) {
  const canBackdate = hasNrcsRoleAtLeast(profile.role, "editor");

  return (
    <div className="grid gap-3">
      {followUps.map((followUp) => {
        const isDone = followUp.status === "completed" || followUp.status === "canceled";
        return (
          <article key={followUp.id} className="grid gap-3 rounded border border-neutral-200 bg-white p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{followUp.title}</h3>
                <p className="text-neutral-500">
                  Due {formatLocalDateTime(followUp.due_at)}
                  {followUp.context_label ? ` - ${followUp.context_label}` : ""}
                </p>
                {followUp.description && <p className="mt-2 text-neutral-700">{followUp.description}</p>}
              </div>
              <form action={updateFollowUpStatus} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={followUp.id} />
                <input type="hidden" name="return_to" value={returnTo} />
                <select name="status" defaultValue={followUp.status} className="rounded border border-neutral-300 px-2 py-1">
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="canceled">Canceled</option>
                </select>
                <button className="rounded border border-neutral-300 px-3 py-1 font-semibold">Update</button>
              </form>
            </div>
            {(logsByFollowUp?.get(followUp.id) || []).length > 0 && (
              <div className="grid gap-2 border-t border-neutral-100 pt-3">
                {(logsByFollowUp?.get(followUp.id) || []).slice(0, 4).map((log) => (
                  <p key={log.id} className="text-xs text-neutral-600">
                    <span className="font-medium">{formatLocalDateTime(log.happened_at)}</span>: {log.note}
                    {log.backdated ? " (backdated)" : ""}
                  </p>
                ))}
              </div>
            )}
            {!isDone && (
              <form action={addFollowUpNote} className="grid gap-2 border-t border-neutral-100 pt-3 md:grid-cols-[1fr_auto_auto]">
                <input type="hidden" name="id" value={followUp.id} />
                <input type="hidden" name="return_to" value={returnTo} />
                <input name="note" placeholder="Add timestamped note" className="rounded border border-neutral-300 px-3 py-2" />
                {canBackdate && <input name="happened_at" type="datetime-local" className="rounded border border-neutral-300 px-3 py-2" />}
                <button className="rounded bg-neutral-900 px-3 py-2 font-semibold text-white">Add Note</button>
              </form>
            )}
          </article>
        );
      })}
      {followUps.length === 0 && <p className="rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-500">No Follow-Ups match this view.</p>}
    </div>
  );
}

export function StoryWakePanel({
  activeWake,
  districtKey,
  returnTo,
  storyId,
}: {
  activeWake: StoryWakeRow | null;
  districtKey: string;
  returnTo: string;
  storyId: string;
}) {
  return (
    <section className="grid gap-4 rounded border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Story Wake</h3>
          <p className="text-sm text-neutral-500">A Wake does not change the story lifecycle state.</p>
        </div>
        {activeWake && (
          <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Calendar: wakes {formatLocalDateTime(activeWake.wake_at)}
          </div>
        )}
      </div>

      {activeWake && (
        <div className="grid gap-2 text-sm">
          {activeWake.reason && <p>{activeWake.reason}</p>}
          <div className="flex flex-wrap gap-2">
            <form action={updateStoryWake}>
              <input type="hidden" name="wake_id" value={activeWake.id} />
              <input type="hidden" name="wake_action" value="snooze" />
              <input type="hidden" name="snooze_preset" value="tomorrow" />
              <input type="hidden" name="return_to" value={returnTo} />
              <button className="rounded border border-neutral-300 px-3 py-1 font-semibold">Snooze Tomorrow</button>
            </form>
            <form action={updateStoryWake}>
              <input type="hidden" name="wake_id" value={activeWake.id} />
              <input type="hidden" name="wake_action" value="snooze" />
              <input type="hidden" name="snooze_preset" value="3days" />
              <input type="hidden" name="return_to" value={returnTo} />
              <button className="rounded border border-neutral-300 px-3 py-1 font-semibold">3 Days</button>
            </form>
            <form action={updateStoryWake}>
              <input type="hidden" name="wake_id" value={activeWake.id} />
              <input type="hidden" name="wake_action" value="snooze" />
              <input type="hidden" name="snooze_preset" value="1week" />
              <input type="hidden" name="return_to" value={returnTo} />
              <button className="rounded border border-neutral-300 px-3 py-1 font-semibold">1 Week</button>
            </form>
            <form action={updateStoryWake}>
              <input type="hidden" name="wake_id" value={activeWake.id} />
              <input type="hidden" name="wake_action" value="activate" />
              <input type="hidden" name="return_to" value={returnTo} />
              <button className="rounded border border-neutral-300 px-3 py-1 font-semibold">Activate</button>
            </form>
            <form action={updateStoryWake}>
              <input type="hidden" name="wake_id" value={activeWake.id} />
              <input type="hidden" name="wake_action" value="close" />
              <input type="hidden" name="return_to" value={returnTo} />
              <button className="rounded border border-neutral-300 px-3 py-1 font-semibold">Close</button>
            </form>
          </div>
          <form action={updateStoryWake} className="grid gap-2 rounded border border-neutral-100 bg-neutral-50 p-3 md:grid-cols-[1fr_1fr_auto]">
            <input type="hidden" name="wake_id" value={activeWake.id} />
            <input type="hidden" name="wake_action" value="snooze" />
            <input type="hidden" name="return_to" value={returnTo} />
            <input name="wake_date" type="date" required className="rounded border border-neutral-300 px-3 py-2" />
            <input name="wake_time" type="time" className="rounded border border-neutral-300 px-3 py-2" />
            <button className="rounded border border-neutral-300 px-3 py-2 font-semibold">Custom Snooze</button>
          </form>
        </div>
      )}

      <form action={createStoryWake} className="grid gap-3 border-t border-neutral-100 pt-3 md:grid-cols-2">
        <input type="hidden" name="story_id" value={storyId} />
        <input type="hidden" name="district_key" value={districtKey} />
        <input type="hidden" name="return_to" value={returnTo} />
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Wake Date</span>
          <input name="wake_date" type="date" required className="rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Wake Time</span>
          <input name="wake_time" type="time" className="rounded border border-neutral-300 px-3 py-2" />
        </label>
        <textarea name="reason" placeholder="Wake reason" className="min-h-[80px] rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2" />
        <button className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Set Wake</button>
      </form>
    </section>
  );
}

export function ContextLink({
  href,
  label,
}: {
  href: string | null;
  label: string | null;
}) {
  if (!href || !label) return null;
  return <Link href={href} className="text-sm font-semibold underline">{label}</Link>;
}
