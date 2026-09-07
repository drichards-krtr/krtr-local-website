import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireNrcsStaff } from "./auth";
import { plainTextToHtml, sanitizeRichTextHtml } from "./richText";
import { createNrcsServerClient } from "./server";

export const EDITION_STATUSES = ["draft", "ready", "recorded", "aired", "archived"] as const;
export const RUNDOWN_ITEM_TYPES = ["story", "segment", "script", "production_note"] as const;

export type EditionStatus = (typeof EDITION_STATUSES)[number];
export type RundownItemType = (typeof RUNDOWN_ITEM_TYPES)[number];

export function formatDateTimeLocal(value: string | null | undefined) {
  return value ? value.slice(0, 16) : "";
}

export function formatProgramDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function defaultEditionTitle(programName: string, airAt: string) {
  const date = new Date(airAt);
  const label = Number.isNaN(date.getTime())
    ? airAt
    : new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
  return `${programName} - ${label}`;
}

export function scriptTextFromHtml(value: string | null | undefined) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h1|h2|li|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function withQueryParam(path: string, key: string, value: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

async function nextSortOrder(editionId: string) {
  const supabase = await createNrcsServerClient();
  const { data } = await supabase
    .from("nrcs_rundown_items")
    .select("sort_order")
    .eq("edition_id", editionId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.sort_order || 0) + 10;
}

export async function createEdition(formData: FormData) {
  "use server";

  const { profile } = await requireNrcsStaff("editor");
  const programId = String(formData.get("program_id") || "");
  const districtKey = String(formData.get("district_key") || "dlpc");
  const airAt = String(formData.get("air_at") || "").trim();
  const recordingAt = String(formData.get("recording_at") || "").trim() || null;
  const suppliedTitle = String(formData.get("title") || "").trim();
  const supabase = await createNrcsServerClient();

  if (!programId || !airAt) {
    redirect(`/programs?district=${districtKey}&error=${encodeURIComponent("Program and air date/time are required.")}`);
  }

  const { data: program, error: programError } = await supabase
    .from("nrcs_programs")
    .select("id, name, district_key")
    .eq("id", programId)
    .maybeSingle();
  if (programError || !program) {
    redirect(`/programs?district=${districtKey}&error=${encodeURIComponent(programError?.message || "Program not found.")}`);
  }

  const title = suppliedTitle || defaultEditionTitle(program.name, airAt);
  const { data: edition, error } = await supabase
    .from("nrcs_editions")
    .insert({
      program_id: program.id,
      district_key: program.district_key,
      title,
      air_at: airAt,
      recording_at: recordingAt,
      created_by: profile.id,
      updated_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !edition) {
    redirect(`/programs?district=${districtKey}&error=${encodeURIComponent(error?.message || "Unable to create Edition.")}`);
  }

  const { data: template } = await supabase
    .from("nrcs_program_templates")
    .select("id")
    .eq("program_id", program.id)
    .eq("enabled", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (template) {
    const { data: templateItems } = await supabase
      .from("nrcs_program_template_items")
      .select("item_type, title, body_html, segment_kind, sort_order")
      .eq("template_id", template.id)
      .order("sort_order", { ascending: true });

    if (templateItems?.length) {
      await supabase.from("nrcs_rundown_items").insert(
        templateItems.map((item) => ({
          edition_id: edition.id,
          item_type: item.item_type,
          title: item.title,
          body_html: item.body_html,
          segment_kind: item.segment_kind,
          sort_order: item.sort_order,
          created_by: profile.id,
          updated_by: profile.id,
        }))
      );
    }
  }

  revalidatePath("/programs");
  redirect(`/editions/${edition.id}?success=created`);
}

export async function updateEdition(formData: FormData) {
  "use server";

  const { profile } = await requireNrcsStaff("editor");
  const id = String(formData.get("edition_id") || "");
  const status = String(formData.get("status") || "draft");
  const airAt = String(formData.get("air_at") || "").trim();
  const recordingAt = String(formData.get("recording_at") || "").trim() || null;
  let title = String(formData.get("title") || "").trim();
  const payload = {
    title,
    air_at: airAt,
    recording_at: recordingAt,
    status: EDITION_STATUSES.includes(status as EditionStatus) ? status : "draft",
    updated_by: profile.id,
  };
  const supabase = await createNrcsServerClient();
  const { error } = await supabase.from("nrcs_editions").update(payload).eq("id", id);
  if (error) redirect(`/editions/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/editions/${id}`);
  redirect(`/editions/${id}?success=edition`);
}

export async function addRundownItem(formData: FormData) {
  "use server";

  const { profile } = await requireNrcsStaff("editor");
  const editionId = String(formData.get("edition_id") || "");
  const itemType = String(formData.get("item_type") || "script") as RundownItemType;
  let title = String(formData.get("title") || "").trim();
  const bodyHtml = sanitizeRichTextHtml(String(formData.get("body_html") || "")) || plainTextToHtml("");
  const copyVersionId = String(formData.get("copy_version_id") || "").trim();
  const supabase = await createNrcsServerClient();

  if (!RUNDOWN_ITEM_TYPES.includes(itemType)) {
    redirect(`/editions/${editionId}?error=${encodeURIComponent("Item type is required.")}`);
  }

  let storyId: string | null = null;
  if (itemType === "story") {
    if (!copyVersionId) redirect(`/editions/${editionId}?error=${encodeURIComponent("Story Items require a Rundown Copy version.")}`);
    const [{ data: edition }, { data: version }] = await Promise.all([
      supabase.from("nrcs_editions").select("district_key").eq("id", editionId).maybeSingle(),
      supabase
        .from("nrcs_copy_versions")
        .select("id, stream_id, headline")
        .eq("id", copyVersionId)
        .maybeSingle(),
    ]);
    const { data: stream } = version?.stream_id
      ? await supabase
          .from("nrcs_copy_streams")
          .select("story_id, stream_type, nrcs_stories(district_key, title)")
          .eq("id", version.stream_id)
          .maybeSingle()
      : { data: null };
    const story = Array.isArray(stream?.nrcs_stories) ? stream?.nrcs_stories[0] : stream?.nrcs_stories;
    if (!stream || stream.stream_type !== "rundown" || story?.district_key !== edition?.district_key) {
      redirect(`/editions/${editionId}?error=${encodeURIComponent("Only Rundown Copy versions can be added as Story Items.")}`);
    }
    storyId = stream.story_id;
    title = title || version?.headline || story?.title || "Story Item";
  } else if (!title) {
    redirect(`/editions/${editionId}?error=${encodeURIComponent("Title is required.")}`);
  }

  const { data: insertedItem, error } = await supabase.from("nrcs_rundown_items").insert({
    edition_id: editionId,
    item_type: itemType,
    sort_order: await nextSortOrder(editionId),
    title,
    body_html: itemType === "story" ? null : bodyHtml,
    segment_kind: itemType === "segment" ? String(formData.get("segment_kind") || "").trim() || null : null,
    story_id: storyId,
    copy_version_id: itemType === "story" ? copyVersionId : null,
    created_by: profile.id,
    updated_by: profile.id,
  }).select("id").single();

  if (error) redirect(`/editions/${editionId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/editions/${editionId}`);
  redirect(`/editions/${editionId}?success=item${insertedItem?.id ? `&itemId=${insertedItem.id}` : ""}`);
}

export async function addStoryToRundown(formData: FormData) {
  "use server";

  const { profile } = await requireNrcsStaff("editor");
  const editionId = String(formData.get("edition_id") || "");
  const storyId = String(formData.get("story_id") || "");
  const copyVersionId = String(formData.get("copy_version_id") || "");
  const districtKey = String(formData.get("district_key") || "dlpc");
  let title = String(formData.get("title") || "").trim();
  const returnTo = String(formData.get("return_to") || `/stories/${storyId}?district=${districtKey}`);
  const supabase = await createNrcsServerClient();

  if (!editionId || !storyId || !copyVersionId) {
    redirect(withQueryParam(returnTo, "error", "Edition, Story, and Rundown Copy are required."));
  }

  const [{ data: edition }, { data: version }] = await Promise.all([
    supabase.from("nrcs_editions").select("id, district_key").eq("id", editionId).maybeSingle(),
    supabase
      .from("nrcs_copy_versions")
      .select("id, stream_id, headline")
      .eq("id", copyVersionId)
      .maybeSingle(),
  ]);
  const { data: stream } = version?.stream_id
    ? await supabase
        .from("nrcs_copy_streams")
        .select("story_id, stream_type, nrcs_stories(district_key, title)")
        .eq("id", version.stream_id)
        .maybeSingle()
    : { data: null };
  const story = Array.isArray(stream?.nrcs_stories) ? stream?.nrcs_stories[0] : stream?.nrcs_stories;

  if (!edition || stream?.stream_type !== "rundown" || stream?.story_id !== storyId || story?.district_key !== edition.district_key) {
    redirect(withQueryParam(returnTo, "error", "This Story Rundown Copy cannot be added to that Edition."));
  }
  title = title || version?.headline || story?.title || "Story Item";

  const { data: insertedItem, error } = await supabase.from("nrcs_rundown_items").insert({
    edition_id: editionId,
    item_type: "story",
    sort_order: await nextSortOrder(editionId),
    title,
    story_id: storyId,
    copy_version_id: copyVersionId,
    created_by: profile.id,
    updated_by: profile.id,
  }).select("id").single();

  if (error) redirect(withQueryParam(returnTo, "error", error.message));
  revalidatePath(`/editions/${editionId}`);
  revalidatePath(`/stories/${storyId}`);
  redirect(withQueryParam(returnTo, "success", insertedItem?.id ? `rundown:${insertedItem.id}` : "rundown"));
}

export async function updateRundownItem(formData: FormData) {
  "use server";

  const { profile } = await requireNrcsStaff("editor");
  const editionId = String(formData.get("edition_id") || "");
  const itemId = String(formData.get("item_id") || "");
  const itemType = String(formData.get("item_type") || "");
  const payload =
    itemType === "story"
      ? {
          title: String(formData.get("title") || "").trim(),
          is_checked: formData.get("is_checked") === "on",
          updated_by: profile.id,
        }
      : {
          title: String(formData.get("title") || "").trim(),
          body_html: sanitizeRichTextHtml(String(formData.get("body_html") || "")),
          segment_kind: itemType === "segment" ? String(formData.get("segment_kind") || "").trim() || null : null,
          is_checked: formData.get("is_checked") === "on",
          updated_by: profile.id,
        };
  const supabase = await createNrcsServerClient();
  const { error } = await supabase.from("nrcs_rundown_items").update(payload).eq("id", itemId);
  if (error) redirect(`/editions/${editionId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/editions/${editionId}`);
  redirect(`/editions/${editionId}?success=item`);
}

export async function deleteRundownItem(formData: FormData) {
  "use server";

  await requireNrcsStaff("editor");
  const editionId = String(formData.get("edition_id") || "");
  const itemId = String(formData.get("item_id") || "");
  const supabase = await createNrcsServerClient();
  const { error } = await supabase.from("nrcs_rundown_items").delete().eq("id", itemId);
  if (error) redirect(`/editions/${editionId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/editions/${editionId}`);
  redirect(`/editions/${editionId}?success=deleted`);
}

export async function moveRundownItem(formData: FormData) {
  "use server";

  await requireNrcsStaff("editor");
  const editionId = String(formData.get("edition_id") || "");
  const itemId = String(formData.get("item_id") || "");
  const direction = String(formData.get("direction") || "up");
  const supabase = await createNrcsServerClient();
  const { data } = await supabase
    .from("nrcs_rundown_items")
    .select("id, sort_order")
    .eq("edition_id", editionId)
    .order("sort_order", { ascending: true });
  const items = data || [];
  const index = items.findIndex((item) => item.id === itemId);
  const swapIndex = direction === "down" ? index + 1 : index - 1;
  if (index >= 0 && swapIndex >= 0 && swapIndex < items.length) {
    const current = items[index];
    const swap = items[swapIndex];
    await Promise.all([
      supabase.from("nrcs_rundown_items").update({ sort_order: swap.sort_order }).eq("id", current.id),
      supabase.from("nrcs_rundown_items").update({ sort_order: current.sort_order }).eq("id", swap.id),
    ]);
  }
  revalidatePath(`/editions/${editionId}`);
  redirect(`/editions/${editionId}?success=order`);
}

export async function carryStoryItemToTomorrow(formData: FormData) {
  "use server";

  const { profile } = await requireNrcsStaff("editor");
  const editionId = String(formData.get("edition_id") || "");
  const itemId = String(formData.get("item_id") || "");
  const mode = String(formData.get("carry_mode") || "same");
  const supabase = await createNrcsServerClient();
  const { data: item } = await supabase
    .from("nrcs_rundown_items")
    .select("id, title, story_id, copy_version_id, nrcs_editions(program_id, district_key, air_at)")
    .eq("id", itemId)
    .maybeSingle();
  const edition = Array.isArray(item?.nrcs_editions) ? item?.nrcs_editions[0] : item?.nrcs_editions;
  if (!item || !edition || !item.story_id || !item.copy_version_id) {
    redirect(`/editions/${editionId}?error=${encodeURIComponent("Only Story Items can be carried forward.")}`);
  }

  let copyVersionId = item.copy_version_id;
  if (mode === "updated") {
    const { data: version } = await supabase
      .from("nrcs_copy_versions")
      .select("headline, body_html, version_number, stream_id")
      .eq("id", item.copy_version_id)
      .maybeSingle();
    const { data: latest } = version
      ? await supabase
          .from("nrcs_copy_versions")
          .select("version_number")
          .eq("stream_id", version.stream_id)
          .order("version_number", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };
    if (version) {
      const { data: created } = await supabase
        .from("nrcs_copy_versions")
        .insert({
          stream_id: version.stream_id,
          version_number: Number(latest?.version_number || version.version_number || 0) + 1,
          headline: version.headline,
          body_html: version.body_html,
          created_by: profile.id,
        })
        .select("id")
        .single();
      if (created?.id) copyVersionId = created.id;
    }
  }

  const nextAirAt = new Date(edition.air_at);
  nextAirAt.setDate(nextAirAt.getDate() + 1);
  const { data: existingEdition } = await supabase
    .from("nrcs_editions")
    .select("id")
    .eq("program_id", edition.program_id)
    .gte("air_at", new Date(nextAirAt.getFullYear(), nextAirAt.getMonth(), nextAirAt.getDate()).toISOString())
    .lt("air_at", new Date(nextAirAt.getFullYear(), nextAirAt.getMonth(), nextAirAt.getDate() + 1).toISOString())
    .limit(1)
    .maybeSingle();

  let targetEditionId = existingEdition?.id || null;
  if (!targetEditionId) {
    const { data: program } = await supabase.from("nrcs_programs").select("name").eq("id", edition.program_id).maybeSingle();
    const { data: newEdition, error } = await supabase
      .from("nrcs_editions")
      .insert({
        program_id: edition.program_id,
        district_key: edition.district_key,
        title: defaultEditionTitle(program?.name || "Edition", nextAirAt.toISOString()),
        air_at: nextAirAt.toISOString(),
        created_by: profile.id,
        updated_by: profile.id,
      })
      .select("id")
      .single();
    if (error || !newEdition) redirect(`/editions/${editionId}?error=${encodeURIComponent(error?.message || "Unable to create tomorrow Edition.")}`);
    targetEditionId = newEdition.id;
  }

  await supabase.from("nrcs_rundown_items").insert({
    edition_id: targetEditionId,
    item_type: "story",
    sort_order: await nextSortOrder(targetEditionId),
    title: item.title,
    story_id: item.story_id,
    copy_version_id: copyVersionId,
    carry_source_item_id: item.id,
    created_by: profile.id,
    updated_by: profile.id,
  });

  revalidatePath(`/editions/${targetEditionId}`);
  redirect(`/editions/${targetEditionId}?success=carried`);
}
