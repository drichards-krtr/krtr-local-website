import StoryEditor from "@/components/cms/StoryEditor";
import { createServerSupabase } from "@/lib/supabase/server";

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
        "id, title, tease, body_markdown, status, published_at, image_url, cloudinary_public_id, cloudinary_width, cloudinary_height, mux_playback_id, mux_status, tags, slug, submitter_id"
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

  let submitter: { name: string; phone: string; email: string } | null = null;
  if (story.submitter_id) {
    const { data: submitterRow } = await supabase
      .from("story_submitters")
      .select("name, phone, email")
      .eq("id", story.submitter_id)
      .maybeSingle();
    submitter = submitterRow || null;
  }

  const storyWithSlot = { ...story, slot: slotRow?.slot || null };

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
      <StoryEditor initialStory={storyWithSlot} />
    </div>
  );
}
