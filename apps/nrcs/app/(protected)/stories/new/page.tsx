import { redirect } from "next/navigation";
import { requireNrcsStaff } from "@/lib/auth";
import { getNrcsDistrictContext } from "@/lib/districts";
import { createNrcsServerClient } from "@/lib/server";
import { COPY_STREAM_TYPES, isStoryLifecycleState } from "@/lib/stories";
import { NrcsNewStoryForm } from "@/components/NrcsStoryForms";

async function createStory(formData: FormData) {
  "use server";

  const { profile } = await requireNrcsStaff("contributor");
  const districtKey = String(formData.get("district_key") || "dlpc");
  const title = String(formData.get("title") || "").trim();
  const lifecycleInput = String(formData.get("lifecycle_state") || "idea");
  const lifecycleState = isStoryLifecycleState(lifecycleInput) ? lifecycleInput : "idea";

  if (!title) {
    redirect(`/stories/new?district=${encodeURIComponent(districtKey)}&error=${encodeURIComponent("Title is required")}`);
  }

  const supabase = await createNrcsServerClient();
  const { data: story, error } = await supabase
    .from("nrcs_stories")
    .insert({
      district_key: districtKey,
      title,
      lifecycle_state: lifecycleState,
      created_by: profile.id,
      updated_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !story) {
    redirect(`/stories/new?district=${encodeURIComponent(districtKey)}&error=${encodeURIComponent(error?.message || "Unable to create story")}`);
  }

  await supabase.from("nrcs_story_facts").insert({
    story_id: story.id,
    body_html: "",
    created_by: profile.id,
    updated_by: profile.id,
  });

  for (const streamType of COPY_STREAM_TYPES) {
    const { data: stream, error: streamError } = await supabase
      .from("nrcs_copy_streams")
      .insert({ story_id: story.id, stream_type: streamType })
      .select("id")
      .single();
    if (streamError || !stream) continue;

    const { data: version } = await supabase
      .from("nrcs_copy_versions")
      .insert({
        stream_id: stream.id,
        version_number: 1,
        headline: streamType === "web" ? title : null,
        body_html: "",
        information_changed: false,
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (version) {
      await supabase.from("nrcs_copy_streams").update({ current_version_id: version.id }).eq("id", stream.id);
    }
  }

  redirect(`/stories/${story.id}?district=${encodeURIComponent(districtKey)}&success=created`);
}

export default async function NewStoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ district?: string; error?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) || {};
  await requireNrcsStaff("contributor");
  const { activeDistrict, allowedDistricts } = await getNrcsDistrictContext();
  const districtKey =
    resolvedSearchParams.district && allowedDistricts.some((district) => district.district_key === resolvedSearchParams.district)
      ? resolvedSearchParams.district
      : activeDistrict?.district_key || "dlpc";

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">New Story</h1>
        <p className="text-sm text-neutral-500">Create the canonical Story record before adding notes, sources, assets, or copy.</p>
      </header>
      {resolvedSearchParams.error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{resolvedSearchParams.error}</p>}
      <NrcsNewStoryForm action={createStory} districtOptions={allowedDistricts} selectedDistrictKey={districtKey} />
    </div>
  );
}
