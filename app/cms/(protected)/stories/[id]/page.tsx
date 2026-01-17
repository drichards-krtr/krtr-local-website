import StoryEditor from "@/components/cms/StoryEditor";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function EditStoryPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerSupabase();
  const { data: story } = await supabase
    .from("stories")
    .select(
      "id, title, tease, body_markdown, status, published_at, image_url, cloudinary_public_id, cloudinary_width, cloudinary_height, mux_playback_id, mux_status"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!story) {
    return <p>Story not found.</p>;
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Edit Story</h1>
      <StoryEditor initialStory={story} />
    </div>
  );
}
