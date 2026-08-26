import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireNrcsStaff } from "@/lib/auth";
import { getNrcsDistrictContext } from "@/lib/districts";
import { createNrcsServerClient } from "@/lib/server";
import {
  COPY_STREAM_TYPES,
  copyStreamLabel,
  isStoryLifecycleState,
  sanitizeStoryHtml,
  type CopyStreamType,
} from "@/lib/stories";
import { CopyStreamForms, FactsForm, StoryOverviewForm } from "@/components/NrcsStoryForms";

type StoryRow = {
  id: string;
  district_key: string;
  title: string;
  lifecycle_state: string;
  category_id: string | null;
  created_by: string | null;
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

function storyPath(storyId: string, districtKey: string, params = "success=saved") {
  return `/stories/${storyId}?district=${encodeURIComponent(districtKey)}&${params}`;
}

async function updateOverview(formData: FormData) {
  "use server";

  const { profile } = await requireNrcsStaff("contributor");
  const id = String(formData.get("id") || "");
  const districtKey = String(formData.get("district_key") || "dlpc");
  const title = String(formData.get("title") || "").trim();
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
      updated_by: profile.id,
    })
    .eq("id", id);

  if (error) redirect(storyPath(id, districtKey, `error=${encodeURIComponent(error.message)}`));
  revalidatePath(`/stories/${id}`);
  redirect(storyPath(id, districtKey));
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

async function addAsset(formData: FormData) {
  "use server";

  const { profile } = await requireNrcsStaff("contributor");
  const storyId = String(formData.get("story_id") || "");
  const districtKey = String(formData.get("district_key") || "dlpc");
  const title = String(formData.get("title") || "").trim();
  if (!title) redirect(storyPath(storyId, districtKey, `error=${encodeURIComponent("Asset title is required")}`));

  const supabase = await createNrcsServerClient();
  const { data: asset, error } = await supabase
    .from("nrcs_assets")
    .insert({
      asset_type: String(formData.get("asset_type") || "image"),
      title,
      cloudinary_url: String(formData.get("cloudinary_url") || "").trim() || null,
      cloudinary_public_id: String(formData.get("cloudinary_public_id") || "").trim() || null,
      mux_asset_id: String(formData.get("mux_asset_id") || "").trim() || null,
      mux_playback_id: String(formData.get("mux_playback_id") || "").trim() || null,
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
  ] = await Promise.all([
    supabase.from("nrcs_story_facts").select("body_html").eq("story_id", id).maybeSingle(),
    supabase.from("nrcs_copy_streams").select("id, stream_type, needs_review, review_reason, current_version_id").eq("story_id", id),
    supabase.from("nrcs_review_flags").select("id, reason, status, created_at").eq("story_id", id).eq("status", "open").order("created_at", { ascending: false }),
    supabase.from("nrcs_story_sources").select("interaction_notes, nrcs_sources(id, source_type, name, organization, role_title, email, phone, url)").eq("story_id", id),
    supabase.from("nrcs_story_assets").select("relationship, nrcs_assets(id, asset_type, title, cloudinary_url, mux_playback_id)").eq("story_id", id),
    supabase.from("nrcs_story_events").select("event_id, nrcs_events(id, title, start_at, status)").eq("story_id", id),
    supabase.from("nrcs_related_stories").select("related_story_id, nrcs_stories!nrcs_related_stories_related_story_id_fkey(id, title, lifecycle_state)").eq("story_id", id),
    supabase.from("nrcs_events").select("id, title, start_at, status").eq("district_key", storyRow.district_key).order("start_at", { ascending: false }).limit(100),
    supabase.from("nrcs_stories").select("id, title, lifecycle_state").eq("district_key", storyRow.district_key).neq("id", id).order("updated_at", { ascending: false }).limit(100),
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

      <StoryOverviewForm action={updateOverview} story={storyRow} districtOptions={allowedDistricts} />
      <FactsForm action={saveFacts} storyId={id} bodyHtml={(facts as { body_html?: string } | null)?.body_html || ""} />
      <CopyStreamForms action={saveCopyStream} storyId={id} streams={streamsWithVersions} />

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

      <section className="grid gap-4 rounded border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Sources</h2>
        <div className="grid gap-2 text-sm">
          {(sourceLinks || []).map((link, index) => {
            const source = Array.isArray(link.nrcs_sources) ? link.nrcs_sources[0] : link.nrcs_sources;
            return <p key={`${source?.id || index}`}>{source?.name || "Source"} {source?.organization ? `- ${source.organization}` : ""}</p>;
          })}
          {(sourceLinks || []).length === 0 && <p className="text-neutral-500">No sources attached.</p>}
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
      </section>

      <section className="grid gap-4 rounded border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Assets</h2>
        <div className="grid gap-2 text-sm">
          {(assetLinks || []).map((link, index) => {
            const asset = Array.isArray(link.nrcs_assets) ? link.nrcs_assets[0] : link.nrcs_assets;
            return <p key={`${asset?.id || index}`}>{asset?.title || "Asset"} {asset?.asset_type ? `(${asset.asset_type})` : ""}</p>;
          })}
          {(assetLinks || []).length === 0 && <p className="text-neutral-500">No assets attached.</p>}
        </div>
        <form action={addAsset} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="story_id" value={id} />
          <input type="hidden" name="district_key" value={storyRow.district_key} />
          <select name="asset_type" className="rounded border border-neutral-300 px-3 py-2 text-sm">
            <option value="image">Image</option>
            <option value="graphic">Graphic</option>
            <option value="video">Video</option>
            <option value="document">Document</option>
            <option value="other">Other</option>
          </select>
          <input name="title" placeholder="Asset title" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
          <input name="cloudinary_url" placeholder="Cloudinary URL" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
          <input name="cloudinary_public_id" placeholder="Cloudinary public ID" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
          <input name="mux_asset_id" placeholder="Mux asset ID" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
          <input name="mux_playback_id" placeholder="Mux playback ID" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
          <button className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Add Asset</button>
        </form>
      </section>

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
    </div>
  );
}
