import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireNrcsStaff } from "@/lib/auth";
import { getNrcsDistrictContext } from "@/lib/districts";
import { createNrcsServerClient, createNrcsServiceClient } from "@/lib/server";
import {
  COPY_STREAM_TYPES,
  copyStreamLabel,
  isStoryLifecycleState,
  sanitizeStoryHtml,
  normalizeSlug,
  type CopyStreamType,
} from "@/lib/stories";
import { CopyStreamForms, FactsForm, StoryOverviewForm } from "@/components/NrcsStoryForms";
import NrcsCloudinaryAssetPicker from "@/components/NrcsCloudinaryAssetPicker";
import { NrcsMuxLibraryPicker, NrcsMuxUploader } from "@/components/NrcsMuxVideoTools";
import NrcsStoryTabs from "@/components/NrcsStoryTabs";
import { getMuxAsset, getMuxUpload, muxStatusFromAsset, muxStatusFromUpload, muxThumbnailUrl } from "@/lib/mux";

type StoryRow = {
  id: string;
  district_key: string;
  title: string;
  lifecycle_state: string;
  category_id: string | null;
  created_by: string | null;
};

type WebOutputRow = {
  id: string;
  story_id: string;
  copy_version_id: string | null;
  status: string;
  slug: string | null;
  seo_title: string | null;
  seo_description: string | null;
  scheduled_at: string | null;
  published_at: string | null;
};

type CopyStreamRow = {
  id: string;
  stream_type: CopyStreamType;
  needs_review: boolean;
  review_reason: string | null;
  current_version_id: string | null;
  current_version?: CopyVersionRow | null;
};

type CopyVersionRow = {
  id: string;
  stream_id: string;
  version_number: number;
  headline: string | null;
  body_html: string;
  created_at: string;
};

type TagOption = {
  id: string;
  name: string;
  tag_type: string;
};

function storyPath(storyId: string, districtKey: string, params = "success=saved") {
  return `/stories/${storyId}?district=${encodeURIComponent(districtKey)}&${params}`;
}

function storageSafeFileName(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "source-document";
}

async function updateOverview(formData: FormData) {
  "use server";

  const { profile } = await requireNrcsStaff("contributor");
  const id = String(formData.get("id") || "");
  const districtKey = String(formData.get("district_key") || "dlpc");
  const title = String(formData.get("title") || "").trim();
  const categoryId = String(formData.get("category_id") || "").trim() || null;
  const lifecycleInput = String(formData.get("lifecycle_state") || "idea");
  const lifecycleState = isStoryLifecycleState(lifecycleInput) ? lifecycleInput : "idea";

  if (!id || !title) redirect(`/stories?error=${encodeURIComponent("Story and title are required")}`);

  const supabase = await createNrcsServerClient();
  const { error } = await supabase
    .from("nrcs_stories")
    .update({
      district_key: districtKey,
      title,
      lifecycle_state: lifecycleState,
      category_id: categoryId,
      updated_by: profile.id,
    })
    .eq("id", id);

  if (error) redirect(storyPath(id, districtKey, `error=${encodeURIComponent(error.message)}`));
  revalidatePath(`/stories/${id}`);
  redirect(storyPath(id, districtKey));
}

async function saveWebOutput(formData: FormData) {
  "use server";

  await requireNrcsStaff("contributor");
  const storyId = String(formData.get("story_id") || "");
  const districtKey = String(formData.get("district_key") || "dlpc");
  const outputId = String(formData.get("output_id") || "");
  const slugInput = String(formData.get("slug") || "").trim();
  const slug = slugInput ? normalizeSlug(slugInput) : null;
  const payload = {
    story_id: storyId,
    copy_version_id: String(formData.get("copy_version_id") || "").trim() || null,
    status: String(formData.get("status") || "draft"),
    slug,
    seo_title: String(formData.get("seo_title") || "").trim() || null,
    seo_description: String(formData.get("seo_description") || "").trim() || null,
    scheduled_at: String(formData.get("scheduled_at") || "").trim() || null,
    published_at: String(formData.get("published_at") || "").trim() || null,
  };

  const supabase = await createNrcsServerClient();
  const result = outputId
    ? await supabase.from("nrcs_web_outputs").update(payload).eq("id", outputId)
    : await supabase.from("nrcs_web_outputs").insert(payload);

  if (result.error) redirect(storyPath(storyId, districtKey, `error=${encodeURIComponent(result.error.message)}`));
  revalidatePath(`/stories/${storyId}`);
  redirect(storyPath(storyId, districtKey, "success=web-output"));
}

async function addStoryTag(formData: FormData) {
  "use server";

  await requireNrcsStaff("contributor");
  const storyId = String(formData.get("story_id") || "");
  const districtKey = String(formData.get("district_key") || "dlpc");
  const tagId = String(formData.get("tag_id") || "");
  if (!tagId) redirect(storyPath(storyId, districtKey, `error=${encodeURIComponent("Tag is required")}`));

  const supabase = await createNrcsServerClient();
  const { error } = await supabase.from("nrcs_story_tags").insert({ story_id: storyId, tag_id: tagId });
  if (error) redirect(storyPath(storyId, districtKey, `error=${encodeURIComponent(error.message)}`));
  revalidatePath(`/stories/${storyId}`);
  redirect(storyPath(storyId, districtKey, "success=tag"));
}

async function removeStoryTag(formData: FormData) {
  "use server";

  await requireNrcsStaff("contributor");
  const storyId = String(formData.get("story_id") || "");
  const districtKey = String(formData.get("district_key") || "dlpc");
  const tagId = String(formData.get("tag_id") || "");
  const supabase = await createNrcsServerClient();
  await supabase.from("nrcs_story_tags").delete().eq("story_id", storyId).eq("tag_id", tagId);
  revalidatePath(`/stories/${storyId}`);
  redirect(storyPath(storyId, districtKey, "success=tag"));
}

async function saveFacts(formData: FormData) {
  "use server";

  const { profile } = await requireNrcsStaff("contributor");
  const storyId = String(formData.get("story_id") || "");
  const bodyHtml = sanitizeStoryHtml(formData.get("body_html"));
  const supabase = await createNrcsServerClient();
  const { data: story } = await supabase.from("nrcs_stories").select("district_key").eq("id", storyId).maybeSingle();
  const districtKey = story?.district_key || "dlpc";

  const { data: existing } = await supabase.from("nrcs_story_facts").select("id").eq("story_id", storyId).maybeSingle();
  const result = existing
    ? await supabase.from("nrcs_story_facts").update({ body_html: bodyHtml, updated_by: profile.id }).eq("id", existing.id)
    : await supabase.from("nrcs_story_facts").insert({ story_id: storyId, body_html: bodyHtml, created_by: profile.id, updated_by: profile.id });

  if (result.error) redirect(storyPath(storyId, districtKey, `error=${encodeURIComponent(result.error.message)}`));
  revalidatePath(`/stories/${storyId}`);
  redirect(storyPath(storyId, districtKey));
}

async function saveCopyStream(formData: FormData) {
  "use server";

  const { profile } = await requireNrcsStaff("contributor");
  const storyId = String(formData.get("story_id") || "");
  const streamType = String(formData.get("stream_type") || "web") as CopyStreamType;
  const headline = String(formData.get("headline") || "").trim() || null;
  const bodyHtml = sanitizeStoryHtml(formData.get("body_html"));
  const informationChanged = formData.get("information_changed") === "yes";

  if (!COPY_STREAM_TYPES.includes(streamType)) {
    redirect(`/stories/${storyId}?error=${encodeURIComponent("Invalid copy stream")}`);
  }

  const supabase = await createNrcsServerClient();
  const { data: story } = await supabase.from("nrcs_stories").select("district_key").eq("id", storyId).maybeSingle();
  const districtKey = story?.district_key || "dlpc";

  let { data: stream, error: streamError } = await supabase
    .from("nrcs_copy_streams")
    .select("id")
    .eq("story_id", storyId)
    .eq("stream_type", streamType)
    .maybeSingle();

  if (!stream && !streamError) {
    const inserted = await supabase
      .from("nrcs_copy_streams")
      .insert({ story_id: storyId, stream_type: streamType })
      .select("id")
      .single();
    stream = inserted.data;
    streamError = inserted.error;
  }

  if (streamError || !stream) {
    redirect(storyPath(storyId, districtKey, `error=${encodeURIComponent(streamError?.message || "Unable to load copy stream")}`));
  }

  const { data: latest } = await supabase
    .from("nrcs_copy_versions")
    .select("version_number")
    .eq("stream_id", stream.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: version, error: versionError } = await supabase
    .from("nrcs_copy_versions")
    .insert({
      stream_id: stream.id,
      version_number: Number(latest?.version_number || 0) + 1,
      headline,
      body_html: bodyHtml,
      information_changed: informationChanged,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (versionError || !version) {
    redirect(storyPath(storyId, districtKey, `error=${encodeURIComponent(versionError?.message || "Unable to save copy version")}`));
  }

  await supabase.from("nrcs_copy_streams").update({ current_version_id: version.id, needs_review: false, review_reason: null }).eq("id", stream.id);

  if (informationChanged) {
    const otherStreams = COPY_STREAM_TYPES.filter((type) => type !== streamType);
    const reason = `${copyStreamLabel(streamType)} changed underlying information.`;
    await supabase
      .from("nrcs_copy_streams")
      .update({ needs_review: true, review_reason: reason })
      .eq("story_id", storyId)
      .in("stream_type", otherStreams);

    const { data: affectedStreams } = await supabase
      .from("nrcs_copy_streams")
      .select("id")
      .eq("story_id", storyId)
      .in("stream_type", otherStreams);

    if (affectedStreams?.length) {
      await supabase.from("nrcs_review_flags").insert(
        affectedStreams.map((affected) => ({
          story_id: storyId,
          copy_stream_id: affected.id,
          reason,
          created_by: profile.id,
        }))
      );
    }
  }

  revalidatePath(`/stories/${storyId}`);
  redirect(storyPath(storyId, districtKey, "success=version"));
}

async function addSource(formData: FormData) {
  "use server";

  const { profile } = await requireNrcsStaff("contributor");
  const storyId = String(formData.get("story_id") || "");
  const districtKey = String(formData.get("district_key") || "dlpc");
  const name = String(formData.get("name") || "").trim();
  const sourceType = String(formData.get("source_type") || "person");
  if (!name) redirect(storyPath(storyId, districtKey, `error=${encodeURIComponent("Source name is required")}`));

  const supabase = await createNrcsServerClient();
  const { data: source, error } = await supabase
    .from("nrcs_sources")
    .insert({
      source_type: sourceType,
      name,
      organization: String(formData.get("organization") || "").trim() || null,
      role_title: String(formData.get("role_title") || "").trim() || null,
      email: String(formData.get("email") || "").trim() || null,
      phone: String(formData.get("phone") || "").trim() || null,
      url: String(formData.get("url") || "").trim() || null,
      notes: String(formData.get("notes") || "").trim() || null,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !source) redirect(storyPath(storyId, districtKey, `error=${encodeURIComponent(error?.message || "Unable to save source")}`));
  await supabase.from("nrcs_story_sources").insert({
    story_id: storyId,
    source_id: source.id,
    interaction_notes: String(formData.get("interaction_notes") || "").trim() || null,
  });
  revalidatePath(`/stories/${storyId}`);
  redirect(storyPath(storyId, districtKey, "success=source"));
}

async function uploadSourceDocument(formData: FormData) {
  "use server";

  const { profile } = await requireNrcsStaff("contributor");
  const storyId = String(formData.get("story_id") || "");
  const districtKey = String(formData.get("district_key") || "dlpc");
  const sourceId = String(formData.get("source_id") || "");
  const file = formData.get("document");

  if (!sourceId || !(file instanceof File) || file.size === 0) {
    redirect(storyPath(storyId, districtKey, `error=${encodeURIComponent("Source and document file are required")}`));
  }

  const supabase = await createNrcsServerClient();
  const { data: link } = await supabase
    .from("nrcs_story_sources")
    .select("story_id")
    .eq("story_id", storyId)
    .eq("source_id", sourceId)
    .maybeSingle();

  if (!link) {
    redirect(storyPath(storyId, districtKey, `error=${encodeURIComponent("Source is not attached to this story")}`));
  }

  const service = createNrcsServiceClient();
  const fileName = storageSafeFileName(file.name);
  const storagePath = `${districtKey}/${storyId}/${crypto.randomUUID()}-${fileName}`;
  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await service.storage
    .from("source-documents")
    .upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    redirect(storyPath(storyId, districtKey, `error=${encodeURIComponent(uploadError.message)}`));
  }

  const { error: metadataError } = await supabase.from("nrcs_source_documents").insert({
    source_id: sourceId,
    storage_bucket: "source-documents",
    storage_path: storagePath,
    file_name: file.name || fileName,
    mime_type: file.type || null,
    file_size: file.size,
    uploaded_by: profile.id,
  });

  if (metadataError) {
    await service.storage.from("source-documents").remove([storagePath]);
    redirect(storyPath(storyId, districtKey, `error=${encodeURIComponent(metadataError.message)}`));
  }

  revalidatePath(`/stories/${storyId}`);
  redirect(storyPath(storyId, districtKey, "success=document"));
}

async function addAsset(formData: FormData) {
  "use server";

  const { profile } = await requireNrcsStaff("contributor");
  const storyId = String(formData.get("story_id") || "");
  const districtKey = String(formData.get("district_key") || "dlpc");
  const title = String(formData.get("title") || "").trim();
  const assetType = String(formData.get("asset_type") || "image");
  const categoryId = String(formData.get("category_id") || "").trim() || null;
  if (!title) redirect(storyPath(storyId, districtKey, `error=${encodeURIComponent("Asset title is required")}`));
  if (!["image", "graphic"].includes(assetType)) {
    redirect(storyPath(storyId, districtKey, `error=${encodeURIComponent("Use the source document or video upload flow for this asset type.")}`));
  }

  const supabase = await createNrcsServerClient();
  const { data: asset, error } = await supabase
    .from("nrcs_assets")
    .insert({
      asset_type: assetType,
      title,
      district_key: districtKey,
      category_id: categoryId,
      cloudinary_url: String(formData.get("cloudinary_url") || "").trim() || null,
      cloudinary_public_id: String(formData.get("cloudinary_public_id") || "").trim() || null,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !asset) redirect(storyPath(storyId, districtKey, `error=${encodeURIComponent(error?.message || "Unable to save asset")}`));
  await supabase.from("nrcs_story_assets").insert({
    story_id: storyId,
    asset_id: asset.id,
    relationship: String(formData.get("relationship") || "supporting").trim() || "supporting",
  });
  revalidatePath(`/stories/${storyId}`);
  redirect(storyPath(storyId, districtKey, "success=asset"));
}

async function refreshVideoAsset(formData: FormData) {
  "use server";

  await requireNrcsStaff("contributor");
  const storyId = String(formData.get("story_id") || "");
  const districtKey = String(formData.get("district_key") || "dlpc");
  const assetId = String(formData.get("asset_id") || "");
  const supabase = await createNrcsServerClient();
  const { data: asset, error } = await supabase
    .from("nrcs_assets")
    .select("id, mux_asset_id, mux_upload_id, mux_playback_id, mux_status")
    .eq("id", assetId)
    .maybeSingle();

  if (error || !asset) {
    redirect(storyPath(storyId, districtKey, `error=${encodeURIComponent(error?.message || "Video asset not found")}`));
  }

  let muxAssetId = asset.mux_asset_id as string | null;
  let muxUploadId = asset.mux_upload_id as string | null;
  let muxPlaybackId = asset.mux_playback_id as string | null;
  let muxStatus = (asset.mux_status as string | null) || "none";

  if (muxUploadId && (!muxAssetId || muxStatus !== "ready")) {
    const upload = await getMuxUpload(muxUploadId);
    if (upload?.asset_id) muxAssetId = upload.asset_id;
    muxStatus = muxStatusFromUpload(upload?.status) || muxStatus;
  }

  if (muxAssetId && (muxStatus !== "ready" || !muxPlaybackId)) {
    const muxAsset = await getMuxAsset(muxAssetId);
    if (muxAsset?.id) muxAssetId = muxAsset.id;
    if (muxAsset?.upload_id) muxUploadId = muxAsset.upload_id;
    muxPlaybackId = muxAsset?.playback_ids?.[0]?.id || muxPlaybackId;
    muxStatus = muxStatusFromAsset(muxAsset?.status) || muxStatus;
  }

  const { error: updateError } = await supabase
    .from("nrcs_assets")
    .update({
      mux_asset_id: muxAssetId,
      mux_upload_id: muxUploadId,
      mux_playback_id: muxPlaybackId,
      mux_status: muxStatus,
      thumbnail_url: muxThumbnailUrl(muxPlaybackId),
    })
    .eq("id", assetId);

  if (updateError) {
    redirect(storyPath(storyId, districtKey, `error=${encodeURIComponent(updateError.message)}`));
  }

  revalidatePath(`/stories/${storyId}`);
  redirect(storyPath(storyId, districtKey, "success=mux-refresh"));
}

async function linkEvent(formData: FormData) {
  "use server";

  await requireNrcsStaff("contributor");
  const storyId = String(formData.get("story_id") || "");
  const districtKey = String(formData.get("district_key") || "dlpc");
  const eventId = String(formData.get("event_id") || "");
  const supabase = await createNrcsServerClient();
  if (eventId) await supabase.from("nrcs_story_events").insert({ story_id: storyId, event_id: eventId });
  revalidatePath(`/stories/${storyId}`);
  redirect(storyPath(storyId, districtKey, "success=event"));
}

async function linkRelatedStory(formData: FormData) {
  "use server";

  await requireNrcsStaff("contributor");
  const storyId = String(formData.get("story_id") || "");
  const districtKey = String(formData.get("district_key") || "dlpc");
  const relatedStoryId = String(formData.get("related_story_id") || "");
  const supabase = await createNrcsServerClient();
  if (relatedStoryId && relatedStoryId !== storyId) {
    await supabase.from("nrcs_related_stories").insert({ story_id: storyId, related_story_id: relatedStoryId });
  }
  revalidatePath(`/stories/${storyId}`);
  redirect(storyPath(storyId, districtKey, "success=related"));
}

async function resolveReviewFlag(formData: FormData) {
  "use server";

  await requireNrcsStaff("contributor");
  const storyId = String(formData.get("story_id") || "");
  const districtKey = String(formData.get("district_key") || "dlpc");
  const flagId = String(formData.get("flag_id") || "");
  const supabase = await createNrcsServerClient();
  await supabase.from("nrcs_review_flags").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", flagId);
  revalidatePath(`/stories/${storyId}`);
  redirect(storyPath(storyId, districtKey, "success=review"));
}

export default async function EditStoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ district?: string; error?: string; success?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = (await searchParams) || {};
  await requireNrcsStaff("contributor");
  const { allowedDistricts } = await getNrcsDistrictContext();
  const supabase = await createNrcsServerClient();

  const { data: story, error: storyError } = await supabase
    .from("nrcs_stories")
    .select("id, district_key, title, lifecycle_state, category_id, created_by")
    .eq("id", id)
    .maybeSingle();

  if (storyError) throw new Error(`Unable to load story: ${storyError.message}`);
  if (!story) return <p>Story not found or not accessible.</p>;

  const storyRow = story as StoryRow;
  const [
    { data: facts },
    { data: streams },
    { data: flags },
    { data: sourceLinks },
    { data: assetLinks },
    { data: eventLinks },
    { data: relatedLinks },
    { data: eventOptions },
    { data: storyOptions },
    { data: categories },
    { data: allTags },
    { data: storyTags },
    { data: webOutput },
  ] = await Promise.all([
    supabase.from("nrcs_story_facts").select("body_html").eq("story_id", id).maybeSingle(),
    supabase.from("nrcs_copy_streams").select("id, stream_type, needs_review, review_reason, current_version_id").eq("story_id", id),
    supabase.from("nrcs_review_flags").select("id, reason, status, created_at").eq("story_id", id).eq("status", "open").order("created_at", { ascending: false }),
    supabase.from("nrcs_story_sources").select("interaction_notes, nrcs_sources(id, source_type, name, organization, role_title, email, phone, url)").eq("story_id", id),
    supabase.from("nrcs_story_assets").select("relationship, nrcs_assets(id, asset_type, title, cloudinary_url, mux_playback_id, mux_status, thumbnail_url, category_id, nrcs_categories(name))").eq("story_id", id),
    supabase.from("nrcs_story_events").select("event_id, nrcs_events(id, title, start_at, status)").eq("story_id", id),
    supabase.from("nrcs_related_stories").select("related_story_id, nrcs_stories!nrcs_related_stories_related_story_id_fkey(id, title, lifecycle_state)").eq("story_id", id),
    supabase.from("nrcs_events").select("id, title, start_at, status").eq("district_key", storyRow.district_key).order("start_at", { ascending: false }).limit(100),
    supabase.from("nrcs_stories").select("id, title, lifecycle_state").eq("district_key", storyRow.district_key).neq("id", id).order("updated_at", { ascending: false }).limit(100),
    supabase.from("nrcs_categories").select("id, name, enabled").eq("district_key", storyRow.district_key).order("name"),
    supabase.from("nrcs_tags").select("id, name, tag_type").order("name"),
    supabase.from("nrcs_story_tags").select("tag_id, nrcs_tags(id, name, tag_type)").eq("story_id", id),
    supabase.from("nrcs_web_outputs").select("id, story_id, copy_version_id, status, slug, seo_title, seo_description, scheduled_at, published_at").eq("story_id", id).limit(1).maybeSingle(),
  ]);

  const streamRows = ((streams || []) as CopyStreamRow[]).sort(
    (a, b) => COPY_STREAM_TYPES.indexOf(a.stream_type) - COPY_STREAM_TYPES.indexOf(b.stream_type)
  );
  const currentVersionIds = streamRows.map((stream) => stream.current_version_id).filter(Boolean) as string[];
  const { data: versions } = currentVersionIds.length
    ? await supabase.from("nrcs_copy_versions").select("id, stream_id, version_number, headline, body_html, created_at").in("id", currentVersionIds)
    : { data: [] as CopyVersionRow[] };
  const versionsById = new Map(((versions || []) as CopyVersionRow[]).map((version) => [version.id, version]));
  const streamsWithVersions = streamRows.map((stream) => ({
    ...stream,
    current_version: stream.current_version_id ? versionsById.get(stream.current_version_id) || null : null,
  }));
  const attachedSourceIds = (sourceLinks || [])
    .map((link) => {
      const source = Array.isArray(link.nrcs_sources) ? link.nrcs_sources[0] : link.nrcs_sources;
      return source?.id;
    })
    .filter(Boolean) as string[];
  const { data: sourceDocuments } = attachedSourceIds.length
    ? await supabase
        .from("nrcs_source_documents")
        .select("id, source_id, file_name, mime_type, file_size, created_at")
        .in("source_id", attachedSourceIds)
        .order("created_at", { ascending: false })
    : { data: [] };
  const categoryOptions = (categories || []) as Array<{ id: string; name: string; enabled: boolean }>;
  const tagOptions = (allTags || []) as TagOption[];
  const openFlagCount = (flags || []).length;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{storyRow.title}</h1>
          <p className="text-sm text-neutral-500">Story lifecycle: {storyRow.lifecycle_state}</p>
        </div>
        <Link href={`/stories?district=${storyRow.district_key}`} className="rounded border border-neutral-300 px-4 py-2 text-sm font-semibold">
          Back to Stories
        </Link>
      </header>

      {resolvedSearchParams.error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{resolvedSearchParams.error}</p>}
      {resolvedSearchParams.success && <p className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">Story update saved.</p>}

      <NrcsStoryTabs
        tabs={[
          {
            id: "overview",
            label: "Overview",
            children: (
              <StoryOverviewForm action={updateOverview} story={storyRow} districtOptions={allowedDistricts} categories={categoryOptions} />
            ),
          },
          {
            id: "facts",
            label: "Facts",
            children: <FactsForm action={saveFacts} storyId={id} bodyHtml={(facts as { body_html?: string } | null)?.body_html || ""} />,
          },
          {
            id: "copy",
            label: "Copy",
            children: <CopyStreamForms action={saveCopyStream} storyId={id} streams={streamsWithVersions} />,
          },
          {
            id: "web-output",
            label: "Web Output",
            children: (
              <section className="grid gap-4 rounded border border-neutral-200 bg-white p-5">
                <h2 className="text-lg font-semibold">Web Output</h2>
                <form action={saveWebOutput} className="grid gap-3 md:grid-cols-2">
                  <input type="hidden" name="story_id" value={id} />
                  <input type="hidden" name="district_key" value={storyRow.district_key} />
                  <input type="hidden" name="output_id" value={(webOutput as WebOutputRow | null)?.id || ""} />
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Status</span>
                    <select name="status" defaultValue={(webOutput as WebOutputRow | null)?.status || "draft"} className="rounded border border-neutral-300 px-3 py-2">
                      <option value="draft">Draft</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="published">Published</option>
                      <option value="unpublished">Unpublished</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Exact Web Copy Version</span>
                    <select name="copy_version_id" defaultValue={(webOutput as WebOutputRow | null)?.copy_version_id || ""} className="rounded border border-neutral-300 px-3 py-2">
                      <option value="">None selected</option>
                      {streamsWithVersions
                        .filter((stream) => stream.stream_type === "web" && stream.current_version)
                        .map((stream) => (
                          <option key={stream.current_version?.id} value={stream.current_version?.id}>
                            Web Copy v{stream.current_version?.version_number}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Slug</span>
                    <input name="slug" defaultValue={(webOutput as WebOutputRow | null)?.slug || ""} className="rounded border border-neutral-300 px-3 py-2" />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Scheduled At</span>
                    <input name="scheduled_at" type="datetime-local" defaultValue={(webOutput as WebOutputRow | null)?.scheduled_at?.slice(0, 16) || ""} className="rounded border border-neutral-300 px-3 py-2" />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Published At</span>
                    <input name="published_at" type="datetime-local" defaultValue={(webOutput as WebOutputRow | null)?.published_at?.slice(0, 16) || ""} className="rounded border border-neutral-300 px-3 py-2" />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">SEO Title</span>
                    <input name="seo_title" defaultValue={(webOutput as WebOutputRow | null)?.seo_title || ""} className="rounded border border-neutral-300 px-3 py-2" />
                  </label>
                  <label className="grid gap-1 text-sm md:col-span-2">
                    <span className="font-medium">SEO Description</span>
                    <textarea name="seo_description" defaultValue={(webOutput as WebOutputRow | null)?.seo_description || ""} className="min-h-[80px] rounded border border-neutral-300 px-3 py-2" />
                  </label>
                  <button className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Save Web Output</button>
                </form>
              </section>
            ),
          },
          {
            id: "tags",
            label: "Tags",
            children: (
              <section className="grid gap-4 rounded border border-neutral-200 bg-white p-5">
                <h2 className="text-lg font-semibold">Tags</h2>
                <div className="flex flex-wrap gap-2">
                  {(storyTags || []).map((link) => {
                    const tag = Array.isArray(link.nrcs_tags) ? link.nrcs_tags[0] : link.nrcs_tags;
                    return tag ? (
                      <form key={tag.id} action={removeStoryTag} className="inline-flex items-center gap-2 rounded border border-neutral-200 px-3 py-1 text-sm">
                        <input type="hidden" name="story_id" value={id} />
                        <input type="hidden" name="district_key" value={storyRow.district_key} />
                        <input type="hidden" name="tag_id" value={tag.id} />
                        <span>{tag.name}</span>
                        <button className="font-semibold">Remove</button>
                      </form>
                    ) : null;
                  })}
                  {(storyTags || []).length === 0 && <p className="text-sm text-neutral-500">No tags attached.</p>}
                </div>
                <form action={addStoryTag} className="flex flex-wrap gap-2">
                  <input type="hidden" name="story_id" value={id} />
                  <input type="hidden" name="district_key" value={storyRow.district_key} />
                  <select name="tag_id" className="rounded border border-neutral-300 px-3 py-2 text-sm">
                    <option value="">Select tag</option>
                    {tagOptions.map((tag) => (
                      <option key={tag.id} value={tag.id}>{tag.name} ({tag.tag_type.replace("_", " ")})</option>
                    ))}
                  </select>
                  <button className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Add Tag</button>
                </form>
              </section>
            ),
          },
          {
            id: "review-flags",
            label: "Review Flags",
            attentionCount: openFlagCount,
            children: (
              <section className="grid gap-4 rounded border border-neutral-200 bg-white p-5">
                <h2 className="text-lg font-semibold">Open Review Flags</h2>
                {(flags || []).map((flag) => (
                  <form key={flag.id} action={resolveReviewFlag} className="flex items-center justify-between gap-3 border-b border-neutral-100 pb-3 text-sm">
                    <input type="hidden" name="story_id" value={id} />
                    <input type="hidden" name="district_key" value={storyRow.district_key} />
                    <input type="hidden" name="flag_id" value={flag.id} />
                    <span>{flag.reason}</span>
                    <button className="rounded border border-neutral-300 px-3 py-1 font-semibold">Resolve</button>
                  </form>
                ))}
                {(flags || []).length === 0 && <p className="text-sm text-neutral-500">No open review flags.</p>}
              </section>
            ),
          },
          {
            id: "sources",
            label: "Sources",
            children: (
              <section className="grid gap-4 rounded border border-neutral-200 bg-white p-5">
                <h2 className="text-lg font-semibold">Sources</h2>
                <div className="grid gap-2 text-sm">
                  {(sourceLinks || []).map((link, index) => {
                    const source = Array.isArray(link.nrcs_sources) ? link.nrcs_sources[0] : link.nrcs_sources;
                    return <p key={`${source?.id || index}`}>{source?.name || "Source"} {source?.organization ? `- ${source.organization}` : ""}</p>;
                  })}
                  {(sourceLinks || []).length === 0 && <p className="text-neutral-500">No sources attached.</p>}
                </div>
                <div className="grid gap-2 text-sm">
                  <h3 className="font-semibold">Private Source Documents</h3>
                  {(sourceDocuments || []).map((document) => (
                    <a key={document.id} href={`/api/source-documents/${document.id}/download`} className="underline">
                      {document.file_name}
                    </a>
                  ))}
                  {(sourceDocuments || []).length === 0 && <p className="text-neutral-500">No source documents uploaded.</p>}
                </div>
                <form action={addSource} className="grid gap-3 md:grid-cols-2">
                  <input type="hidden" name="story_id" value={id} />
                  <input type="hidden" name="district_key" value={storyRow.district_key} />
                  <select name="source_type" className="rounded border border-neutral-300 px-3 py-2 text-sm">
                    <option value="person">Person</option>
                    <option value="document">Document</option>
                    <option value="web">Web</option>
                    <option value="other">Other</option>
                  </select>
                  <input name="name" placeholder="Source name/title" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
                  <input name="organization" placeholder="Organization" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
                  <input name="role_title" placeholder="Role/title" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
                  <input name="email" placeholder="Email" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
                  <input name="phone" placeholder="Phone" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
                  <input name="url" placeholder="URL" className="rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2" />
                  <textarea name="notes" placeholder="General notes" className="min-h-[80px] rounded border border-neutral-300 px-3 py-2 text-sm md:col-span-2" />
                  <button className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Add Source</button>
                </form>
                {(sourceLinks || []).length > 0 && (
                  <form action={uploadSourceDocument} className="grid gap-3 border-t border-neutral-100 pt-4 md:grid-cols-[1fr_1fr_auto]">
                    <input type="hidden" name="story_id" value={id} />
                    <input type="hidden" name="district_key" value={storyRow.district_key} />
                    <select name="source_id" className="rounded border border-neutral-300 px-3 py-2 text-sm">
                      {(sourceLinks || []).map((link, index) => {
                        const source = Array.isArray(link.nrcs_sources) ? link.nrcs_sources[0] : link.nrcs_sources;
                        return source ? <option key={source.id || index} value={source.id}>{source.name}</option> : null;
                      })}
                    </select>
                    <input name="document" type="file" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
                    <button className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Upload Document</button>
                  </form>
                )}
              </section>
            ),
          },
          {
            id: "assets",
            label: "Assets",
            children: (
              <section className="grid gap-4 rounded border border-neutral-200 bg-white p-5">
                <h2 className="text-lg font-semibold">Assets</h2>
                <div className="grid gap-3 text-sm">
                  {(assetLinks || []).map((link, index) => {
                    const asset = Array.isArray(link.nrcs_assets) ? link.nrcs_assets[0] : link.nrcs_assets;
                    if (!asset) return null;
                    const thumbnail = asset.thumbnail_url || muxThumbnailUrl(asset.mux_playback_id);
                    return (
                      <div key={`${asset.id || index}`} className="grid gap-3 rounded border border-neutral-100 p-3 md:grid-cols-[120px_1fr_auto]">
                        <div className="aspect-video bg-neutral-100">
                          {asset.cloudinary_url ? <img src={asset.cloudinary_url} alt="" className="h-full w-full object-cover" /> : null}
                          {!asset.cloudinary_url && thumbnail ? <img src={thumbnail} alt="" className="h-full w-full object-cover" /> : null}
                        </div>
                        <div>
                          <div className="font-medium">{asset.title}</div>
                          <div className="text-xs text-neutral-500">
                            {asset.asset_type}
                            {asset.mux_status ? ` - ${asset.mux_status}` : ""}
                          </div>
                        </div>
                        {asset.asset_type === "video" && (
                          <form action={refreshVideoAsset}>
                            <input type="hidden" name="story_id" value={id} />
                            <input type="hidden" name="district_key" value={storyRow.district_key} />
                            <input type="hidden" name="asset_id" value={asset.id} />
                            <button className="rounded border border-neutral-300 px-3 py-2 text-sm font-semibold">Refresh Status</button>
                          </form>
                        )}
                      </div>
                    );
                  })}
                  {(assetLinks || []).length === 0 && <p className="text-neutral-500">No assets attached.</p>}
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  <NrcsCloudinaryAssetPicker action={addAsset} storyId={id} districtKey={storyRow.district_key} categoryId={storyRow.category_id} />
                  <NrcsMuxUploader
                    storyId={id}
                    districtKey={storyRow.district_key}
                    categoryId={storyRow.category_id}
                    categories={categoryOptions}
                    tags={tagOptions}
                  />
                  <div className="rounded border border-neutral-200 p-4">
                    <h3 className="mb-3 font-semibold">Mux Library</h3>
                    <NrcsMuxLibraryPicker storyId={id} districtKey={storyRow.district_key} categories={categoryOptions} tags={tagOptions} />
                  </div>
                </div>
              </section>
            ),
          },
          {
            id: "links",
            label: "Links",
            children: (
              <section className="grid gap-4 rounded border border-neutral-200 bg-white p-5">
                <h2 className="text-lg font-semibold">Linked Events & Related Stories</h2>
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  <div>
                    <h3 className="font-semibold">Events</h3>
                    {(eventLinks || []).map((link, index) => {
                      const event = Array.isArray(link.nrcs_events) ? link.nrcs_events[0] : link.nrcs_events;
                      return <p key={`${event?.id || index}`}>{event?.title || link.event_id}</p>;
                    })}
                    {(eventLinks || []).length === 0 && <p className="text-neutral-500">No events linked.</p>}
                  </div>
                  <div>
                    <h3 className="font-semibold">Related Stories</h3>
                    {(relatedLinks || []).map((link, index) => {
                      const related = Array.isArray(link.nrcs_stories) ? link.nrcs_stories[0] : link.nrcs_stories;
                      return <p key={`${related?.id || index}`}>{related?.title || link.related_story_id}</p>;
                    })}
                    {(relatedLinks || []).length === 0 && <p className="text-neutral-500">No related stories linked.</p>}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <form action={linkEvent} className="flex gap-2">
                    <input type="hidden" name="story_id" value={id} />
                    <input type="hidden" name="district_key" value={storyRow.district_key} />
                    <select name="event_id" className="min-w-0 flex-1 rounded border border-neutral-300 px-3 py-2 text-sm">
                      <option value="">Select event</option>
                      {(eventOptions || []).map((event) => (
                        <option key={event.id} value={event.id}>{event.title}</option>
                      ))}
                    </select>
                    <button className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">Link Event</button>
                  </form>
                  <form action={linkRelatedStory} className="flex gap-2">
                    <input type="hidden" name="story_id" value={id} />
                    <input type="hidden" name="district_key" value={storyRow.district_key} />
                    <select name="related_story_id" className="min-w-0 flex-1 rounded border border-neutral-300 px-3 py-2 text-sm">
                      <option value="">Select story</option>
                      {(storyOptions || []).map((option) => (
                        <option key={option.id} value={option.id}>{option.title}</option>
                      ))}
                    </select>
                    <button className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">Link Story</button>
                  </form>
                </div>
              </section>
            ),
          },
        ]}
      />
    </div>
  );
}
