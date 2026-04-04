import StoryEditor from "@/components/cms/StoryEditor";
import { syncStoryVideoState } from "@/lib/mux";
import { createServerSupabase } from "@/lib/supabase/server";
import { getTagTree } from "@/lib/tags";

export default async function EditStoryPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerSupabase();
  const [{ data: story }, { data: slotRow }] = await Promise.all([
    supabase
      .from("stories")
      .select(
        "id, district_key, title, tease, body_markdown, status, published_at, image_url, cloudinary_public_id, cloudinary_width, cloudinary_height, mux_asset_id, mux_upload_id, mux_playback_id, mux_status, tags, slug, submitter_id"
      )
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("story_slots")
      .select("slot")
      .eq("story_id", params.id)
      .limit(1)
      .maybeSingle(),
  ]);

  if (!story) {
    return <p>Story not found.</p>;
  }

  const syncedVideo =
    story.mux_status === "ready" && story.mux_playback_id
      ? null
      : await syncStoryVideoState(story.id);
  const syncedStory = syncedVideo
    ? {
        ...story,
        mux_asset_id: syncedVideo.mux_asset_id,
        mux_upload_id: syncedVideo.mux_upload_id,
        mux_playback_id: syncedVideo.mux_playback_id,
        mux_status: syncedVideo.mux_status,
      }
    : story;

  let submitter: { name: string; phone: string; email: string } | null = null;
  if (syncedStory.submitter_id) {
    const { data: submitterRow } = await supabase
      .from("story_submitters")
      .select("name, phone, email")
      .eq("id", syncedStory.submitter_id)
      .maybeSingle();
    submitter = submitterRow || null;
  }

  const storyWithSlot = { ...syncedStory, slot: slotRow?.slot || null };

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Edit Story</h1>
      {submitter && (
        <section className="mb-4 rounded border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-600">
            Submitter Contact
          </h2>
          <p className="mt-2 text-sm text-neutral-700">Name: {submitter.name}</p>
          <p className="text-sm text-neutral-700">Phone: {submitter.phone}</p>
          <p className="text-sm text-neutral-700">Email: {submitter.email}</p>
        </section>
      )}
      <StoryEditor
        initialStory={storyWithSlot}
        initialDistrictKey={syncedStory.district_key}
        tagTree={getTagTree(syncedStory.district_key)}
      />
    </div>
  );
}
