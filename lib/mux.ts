import { createServiceClient } from "@/lib/supabase/admin";

type StoryVideoRow = {
  id: string;
  district_key: string;
  mux_asset_id: string | null;
  mux_upload_id: string | null;
  mux_playback_id: string | null;
  mux_status: string | null;
};

type MuxPlayback = {
  id?: string;
};

type MuxAsset = {
  id?: string;
  status?: string;
  upload_id?: string | null;
  playback_ids?: MuxPlayback[] | null;
};

type MuxUpload = {
  id?: string;
  status?: string;
  asset_id?: string | null;
};

type StoryVideoPatch = Partial<{
  mux_asset_id: string | null;
  mux_upload_id: string | null;
  mux_playback_id: string | null;
  mux_status: string | null;
}>;

function getMuxCredentials() {
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) {
    return null;
  }
  return { tokenId, tokenSecret };
}

async function fetchMuxData<T>(path: string): Promise<T | null> {
  const credentials = getMuxCredentials();
  if (!credentials) {
    return null;
  }

  const response = await fetch(`https://api.mux.com${path}`, {
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${credentials.tokenId}:${credentials.tokenSecret}`).toString("base64"),
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`[Mux] ${path} failed with ${response.status}: ${body || "Unknown error"}`);
  }

  const json = await response.json();
  return (json?.data || null) as T | null;
}

async function getMuxAsset(assetId: string) {
  return fetchMuxData<MuxAsset>(`/video/v1/assets/${assetId}`);
}

async function getMuxUpload(uploadId: string) {
  return fetchMuxData<MuxUpload>(`/video/v1/uploads/${uploadId}`);
}

function getNextStatusFromUpload(status: string | null | undefined) {
  if (!status) return null;
  if (status === "waiting") return "uploading";
  if (status === "asset_created") return "processing";
  if (status === "errored" || status === "cancelled") return "errored";
  return "processing";
}

function getNextStatusFromAsset(status: string | null | undefined) {
  if (!status) return null;
  if (status === "ready") return "ready";
  if (status === "errored") return "errored";
  return "processing";
}

async function applyStoryVideoPatch(storyId: string, patch: StoryVideoPatch) {
  if (Object.keys(patch).length === 0) {
    return;
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("stories").update(patch).eq("id", storyId);
  if (error) {
    throw new Error(`[Mux] Failed to update story ${storyId}: ${error.message}`);
  }
}

export async function syncStoryVideoState(storyId: string) {
  const credentials = getMuxCredentials();
  const supabase = createServiceClient();

  const { data: story, error } = await supabase
    .from("stories")
    .select("id, district_key, mux_asset_id, mux_upload_id, mux_playback_id, mux_status")
    .eq("id", storyId)
    .maybeSingle();

  if (error) {
    throw new Error(`[Mux] Failed to load story ${storyId}: ${error.message}`);
  }

  if (!story) {
    return null;
  }

  if (!credentials) {
    return story as StoryVideoRow;
  }

  const current = story as StoryVideoRow;
  let nextAssetId = current.mux_asset_id;
  let nextUploadId = current.mux_upload_id;
  let nextPlaybackId = current.mux_playback_id;
  let nextStatus = current.mux_status || "none";

  if (nextUploadId && (!nextAssetId || nextStatus !== "ready")) {
    const upload = await getMuxUpload(nextUploadId);
    if (upload?.asset_id) {
      nextAssetId = upload.asset_id;
    }
    const uploadStatus = getNextStatusFromUpload(upload?.status);
    if (uploadStatus) {
      nextStatus = uploadStatus;
    }
  }

  if (nextAssetId && (nextStatus !== "ready" || !nextPlaybackId)) {
    const asset = await getMuxAsset(nextAssetId);
    if (asset?.id) {
      nextAssetId = asset.id;
    }
    if (asset?.upload_id) {
      nextUploadId = asset.upload_id;
    }
    const playbackId = asset?.playback_ids?.[0]?.id || null;
    if (playbackId) {
      nextPlaybackId = playbackId;
    }
    const assetStatus = getNextStatusFromAsset(asset?.status);
    if (assetStatus) {
      nextStatus = assetStatus;
    }
  }

  const patch: StoryVideoPatch = {};
  if (nextAssetId !== current.mux_asset_id) patch.mux_asset_id = nextAssetId;
  if (nextUploadId !== current.mux_upload_id) patch.mux_upload_id = nextUploadId;
  if (nextPlaybackId !== current.mux_playback_id) patch.mux_playback_id = nextPlaybackId;
  if (nextStatus !== (current.mux_status || "none")) patch.mux_status = nextStatus;

  await applyStoryVideoPatch(current.id, patch);

  return {
    ...current,
    mux_asset_id: nextAssetId,
    mux_upload_id: nextUploadId,
    mux_playback_id: nextPlaybackId,
    mux_status: nextStatus,
  } satisfies StoryVideoRow;
}
