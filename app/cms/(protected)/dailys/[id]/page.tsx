import DailyEditor from "@/components/cms/DailyEditor";
import { syncDailyVideoState } from "@/lib/mux";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function EditDailyPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createServerSupabase();
  const { data: daily } = await supabase
    .from("dailys")
    .select(
      "id, district_key, title, status, published_at, image_url, cloudinary_public_id, cloudinary_width, cloudinary_height, mux_asset_id, mux_upload_id, mux_playback_id, mux_status, video_orientation, slug"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!daily) {
    return <p>Daily not found.</p>;
  }

  const syncedVideo =
    daily.mux_status === "ready" && daily.mux_playback_id
      ? null
      : await syncDailyVideoState(daily.id);
  const syncedDaily = syncedVideo
    ? {
        ...daily,
        mux_asset_id: syncedVideo.mux_asset_id,
        mux_upload_id: syncedVideo.mux_upload_id,
        mux_playback_id: syncedVideo.mux_playback_id,
        mux_status: syncedVideo.mux_status,
      }
    : daily;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Edit Daily</h1>
      <DailyEditor initialDaily={syncedDaily} initialDistrictKey={syncedDaily.district_key} />
    </div>
  );
}
