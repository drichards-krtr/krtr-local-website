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

export function getMuxCredentials() {
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) return null;
  return { tokenId, tokenSecret };
}

export function muxAuthHeader() {
  const credentials = getMuxCredentials();
  if (!credentials) return null;
  return "Basic " + Buffer.from(`${credentials.tokenId}:${credentials.tokenSecret}`).toString("base64");
}

export async function fetchMuxData<T>(path: string): Promise<T | null> {
  const authorization = muxAuthHeader();
  if (!authorization) return null;

  const response = await fetch(`https://api.mux.com${path}`, {
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`[Mux] ${path} failed with ${response.status}: ${body || "Unknown error"}`);
  }

  const json = await response.json();
  return (json?.data || null) as T | null;
}

export async function getMuxUpload(uploadId: string) {
  return fetchMuxData<MuxUpload>(`/video/v1/uploads/${encodeURIComponent(uploadId)}`);
}

export async function getMuxAsset(assetId: string) {
  return fetchMuxData<MuxAsset>(`/video/v1/assets/${encodeURIComponent(assetId)}`);
}

export function muxStatusFromUpload(status: string | null | undefined) {
  if (!status) return null;
  if (status === "waiting") return "uploading";
  if (status === "asset_created") return "processing";
  if (status === "errored" || status === "cancelled" || status === "timed_out") return "errored";
  return "processing";
}

export function muxStatusFromAsset(status: string | null | undefined) {
  if (!status) return null;
  if (status === "ready") return "ready";
  if (status === "errored") return "errored";
  return "processing";
}

export function muxThumbnailUrl(playbackId: string | null | undefined) {
  return playbackId ? `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0` : null;
}
