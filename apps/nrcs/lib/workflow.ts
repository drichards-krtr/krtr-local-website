import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireNrcsStaff } from "./auth";
import { createNrcsServerClient } from "./server";
import { hasNrcsRoleAtLeast } from "./roles";

export const FOLLOW_UP_STATUSES = ["open", "in_progress", "completed", "canceled"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const INTAKE_STATUSES = ["new", "in_review", "converted", "dismissed"] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export function parseDueAt(dateValue: FormDataEntryValue | null, timeValue: FormDataEntryValue | null) {
  const date = String(dateValue || "").trim();
  const time = String(timeValue || "").trim() || "17:00";
  if (!date) return null;

  const parsed = new Date(`${date}T${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function formatDateInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function formatTimeInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toTimeString().slice(0, 5);
}

export function formatLocalDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function withFeedback(url: string, key: "error" | "success", value: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${key}=${encodeURIComponent(value)}`;
}

export async function recordRecentItem({
  districtKey,
  href,
  objectId,
  objectType,
  title,
}: {
  districtKey: string | null;
  href: string;
  objectId: string;
  objectType: string;
  title: string;
}) {
  const staff = await requireNrcsStaff("contributor");
  const supabase = await createNrcsServerClient();
  await supabase.from("nrcs_recent_items").upsert(
    {
      user_id: staff.profile.id,
      object_type: objectType,
      object_id: objectId,
      district_key: districtKey,
      title,
      href,
      viewed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,object_type,object_id" }
  );
}

export async function createFollowUpFromForm(formData: FormData, redirectTo?: string) {
  "use server";

  const { profile } = await requireNrcsStaff("contributor");
  const districtKey = String(formData.get("district_key") || "dlpc");
  const title = String(formData.get("title") || "").trim();
  const dueAt = parseDueAt(formData.get("due_date"), formData.get("due_time"));
  const contextType = String(formData.get("context_type") || "").trim() || null;
  const contextId = String(formData.get("context_id") || "").trim() || null;
  const note = String(formData.get("note") || "").trim();

  if (!title || !dueAt) {
    redirect(withFeedback(redirectTo || "/follow-ups", "error", "Follow-Up title and due date are required."));
  }

  const supabase = await createNrcsServerClient();
  const { data, error } = await supabase
    .from("nrcs_follow_ups")
    .insert({
      district_key: districtKey,
      title,
      description: String(formData.get("description") || "").trim() || null,
      due_at: dueAt,
      context_type: contextType,
      context_id: contextId,
      context_label: String(formData.get("context_label") || "").trim() || null,
      origin_copy_version_id: String(formData.get("origin_copy_version_id") || "").trim() || null,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(withFeedback(redirectTo || "/follow-ups", "error", error?.message || "Unable to create Follow-Up."));
  }

  await supabase.from("nrcs_follow_up_activity_logs").insert({
    follow_up_id: data.id,
    activity_type: "created",
    note: note || "Follow-Up created.",
    created_by: profile.id,
  });

  revalidatePath("/dashboard");
  revalidatePath("/follow-ups");
  if (redirectTo) revalidatePath(redirectTo.split("?")[0] || redirectTo);
  redirect(withFeedback(redirectTo || "/follow-ups", "success", "follow-up"));
}

export async function updateFollowUpStatus(formData: FormData) {
  "use server";

  const { profile } = await requireNrcsStaff("contributor");
  const id = String(formData.get("id") || "");
  const statusInput = String(formData.get("status") || "open");
  const status = FOLLOW_UP_STATUSES.includes(statusInput as FollowUpStatus)
    ? (statusInput as FollowUpStatus)
    : "open";
  const returnTo = String(formData.get("return_to") || "/follow-ups");
  const now = new Date().toISOString();

  const supabase = await createNrcsServerClient();
  const { error } = await supabase
    .from("nrcs_follow_ups")
    .update({
      status,
      completed_at: status === "completed" ? now : null,
      canceled_at: status === "canceled" ? now : null,
    })
    .eq("id", id);

  if (error) redirect(withFeedback(returnTo, "error", error.message));

  await supabase.from("nrcs_follow_up_activity_logs").insert({
    follow_up_id: id,
    activity_type: status === "completed" ? "completed" : status === "canceled" ? "canceled" : "reopened",
    note: `Status changed to ${status.replace("_", " ")}.`,
    created_by: profile.id,
  });

  revalidatePath("/dashboard");
  revalidatePath("/follow-ups");
  redirect(withFeedback(returnTo, "success", "status"));
}

export async function addFollowUpNote(formData: FormData) {
  "use server";

  const { profile } = await requireNrcsStaff("contributor");
  const id = String(formData.get("id") || "");
  const returnTo = String(formData.get("return_to") || "/follow-ups");
  const note = String(formData.get("note") || "").trim();
  const happenedAtInput = String(formData.get("happened_at") || "").trim();
  const canBackdate = hasNrcsRoleAtLeast(profile.role, "editor");
  const happenedAt = happenedAtInput && canBackdate ? new Date(happenedAtInput).toISOString() : new Date().toISOString();

  if (!note) redirect(withFeedback(returnTo, "error", "Note text is required."));

  const supabase = await createNrcsServerClient();
  const { error } = await supabase.from("nrcs_follow_up_activity_logs").insert({
    follow_up_id: id,
    activity_type: "note",
    note,
    happened_at: happenedAt,
    backdated: Boolean(happenedAtInput && canBackdate),
    created_by: profile.id,
  });

  if (error) redirect(withFeedback(returnTo, "error", error.message));
  revalidatePath("/follow-ups");
  redirect(withFeedback(returnTo, "success", "note"));
}

export async function createStoryWake(formData: FormData) {
  "use server";

  const { profile } = await requireNrcsStaff("contributor");
  const storyId = String(formData.get("story_id") || "");
  const districtKey = String(formData.get("district_key") || "dlpc");
  const wakeAt = parseDueAt(formData.get("wake_date"), formData.get("wake_time"));
  const reason = String(formData.get("reason") || "").trim() || null;
  const returnTo = String(formData.get("return_to") || `/stories/${storyId}?district=${districtKey}`);

  if (!wakeAt) redirect(withFeedback(returnTo, "error", "Wake date is required."));

  const supabase = await createNrcsServerClient();
  await supabase.from("nrcs_story_wakes").update({ status: "closed", closed_by: profile.id, closed_at: new Date().toISOString() }).eq("story_id", storyId).eq("status", "active");
  const { data, error } = await supabase
    .from("nrcs_story_wakes")
    .insert({ story_id: storyId, wake_at: wakeAt, reason, created_by: profile.id })
    .select("id")
    .single();

  if (error || !data) redirect(withFeedback(returnTo, "error", error?.message || "Unable to create Story Wake."));

  await supabase.from("nrcs_story_wake_history").insert({
    wake_id: data.id,
    action: "created",
    note: reason,
    new_wake_at: wakeAt,
    created_by: profile.id,
  });

  revalidatePath("/dashboard");
  revalidatePath(`/stories/${storyId}`);
  redirect(withFeedback(returnTo, "success", "wake"));
}

export async function updateStoryWake(formData: FormData) {
  "use server";

  const { profile } = await requireNrcsStaff("contributor");
  const wakeId = String(formData.get("wake_id") || "");
  const action = String(formData.get("wake_action") || "close");
  const returnTo = String(formData.get("return_to") || "/dashboard");
  const supabase = await createNrcsServerClient();
  const { data: wake } = await supabase.from("nrcs_story_wakes").select("id, wake_at").eq("id", wakeId).maybeSingle();

  if (!wake) redirect(withFeedback(returnTo, "error", "Story Wake not found."));

  if (action === "close" || action === "activate") {
    const { error } = await supabase
      .from("nrcs_story_wakes")
      .update({ status: "closed", closed_by: profile.id, closed_at: new Date().toISOString() })
      .eq("id", wakeId);
    if (error) redirect(withFeedback(returnTo, "error", error.message));
    await supabase.from("nrcs_story_wake_history").insert({
      wake_id: wakeId,
      action: action === "activate" ? "activated" : "closed",
      prior_wake_at: wake.wake_at,
      created_by: profile.id,
    });
  } else {
    const preset = String(formData.get("snooze_preset") || "tomorrow");
    const next = new Date();
    if (preset === "3days") next.setDate(next.getDate() + 3);
    else if (preset === "1week") next.setDate(next.getDate() + 7);
    else next.setDate(next.getDate() + 1);
    next.setHours(17, 0, 0, 0);
    const customWakeAt = parseDueAt(formData.get("wake_date"), formData.get("wake_time"));
    const newWakeAt = customWakeAt || next.toISOString();
    const { error } = await supabase.from("nrcs_story_wakes").update({ wake_at: newWakeAt }).eq("id", wakeId);
    if (error) redirect(withFeedback(returnTo, "error", error.message));
    await supabase.from("nrcs_story_wake_history").insert({
      wake_id: wakeId,
      action: "snoozed",
      prior_wake_at: wake.wake_at,
      new_wake_at: newWakeAt,
      created_by: profile.id,
    });
  }

  revalidatePath("/dashboard");
  redirect(withFeedback(returnTo, "success", "wake"));
}
