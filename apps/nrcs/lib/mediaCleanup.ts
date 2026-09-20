import "server-only";
import { createNrcsServiceClient } from "./server";
import { getCloudinaryCredentials } from "./cloudinary";
import { getNrcsCmsApiEnv } from "./env";
import { muxAuthHeader } from "./mux";

const RETENTION_DAYS = 90;
const cutoff = () => Date.now() - RETENTION_DAYS * 86400000;
type Candidate = { provider: "cloudinary" | "mux" | "supabase"; id: string; created_at: string; bytes?: number };
export type MediaCleanupAudit = { generated_at: string; retention_days: number; candidates: Candidate[]; protected_counts: { cloudinary: number; mux: number; documents: number }; scanned_counts: { cloudinary: number; mux: number; documents: number } };

function cloudinaryId(raw: string) {
  try {
    const path = new URL(raw).pathname.split("/image/upload/")[1]?.replace(/^.*?v\d+\//, "").replace(/\.[^/.]+$/, "");
    return path ? decodeURIComponent(path) : null;
  } catch { return null; }
}
async function cmsReferences() {
  const env = getNrcsCmsApiEnv(); if (!env) throw new Error("NRCS CMS API configuration is missing.");
  const response = await fetch(`${env.baseUrl}/api/nrcs/media-references`, { headers: { Authorization: `Bearer ${env.secret}` }, cache: "no-store", signal: AbortSignal.timeout(20000), redirect: "manual" });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error(data?.error || "CMS media reference audit failed.");
  return data as { cloudinary_public_ids: string[]; cloudinary_urls: string[]; mux_asset_ids: string[] };
}
async function cloudinaryResources() {
  const { cloudName, apiKey, apiSecret } = getCloudinaryCredentials(); const resources: any[] = []; let cursor = "";
  do {
    const params = new URLSearchParams({ prefix: "krtr/", max_results: "500" }); if (cursor) params.set("next_cursor", cursor);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload?${params}`, { headers: { Authorization: "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64") }, cache: "no-store", signal: AbortSignal.timeout(20000) });
    const data = await response.json(); if (!response.ok) throw new Error(data?.error?.message || "Cloudinary audit failed.");
    resources.push(...(data.resources || [])); cursor = data.next_cursor || "";
  } while (cursor);
  return resources;
}
async function muxResources() {
  const authorization = muxAuthHeader(); if (!authorization) throw new Error("Mux credentials are missing.");
  const resources: any[] = [];
  for (let page = 1; ; page++) {
    const response = await fetch(`https://api.mux.com/video/v1/assets?limit=100&page=${page}`, { headers: { Authorization: authorization }, cache: "no-store", signal: AbortSignal.timeout(20000) });
    const data = await response.json(); if (!response.ok) throw new Error(data?.error?.message || "Mux audit failed.");
    const batch = data.data || []; resources.push(...batch); if (batch.length < 100) break;
  }
  return resources;
}
async function storageFiles(path = ""): Promise<any[]> {
  const db = createNrcsServiceClient(); const output: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from("source-documents").list(path, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(error.message); const batch = data || [];
    for (const item of batch) { const name = path ? `${path}/${item.name}` : item.name; if (item.id) output.push({ ...item, path: name }); else output.push(...await storageFiles(name)); }
    if (batch.length < 1000) break;
  }
  return output;
}
export async function auditOrphanMedia(): Promise<MediaCleanupAudit> {
  const db = createNrcsServiceClient();
  const [cms, assets, schools, events, documents, cloudinary, mux, files] = await Promise.all([
    cmsReferences(), db.from("nrcs_assets").select("cloudinary_public_id,cloudinary_url,mux_asset_id"), db.from("nrcs_schools").select("logo_url"), db.from("nrcs_events").select("image_url"), db.from("nrcs_source_documents").select("storage_bucket,storage_path"), cloudinaryResources(), muxResources(), storageFiles(),
  ]);
  const failed = [assets, schools, events, documents].find(result => result.error); if (failed?.error) throw new Error(failed.error.message);
  const cloudRefs = new Set<string>([...cms.cloudinary_public_ids, ...cms.cloudinary_urls.map(cloudinaryId).filter(Boolean), ...(assets.data || []).flatMap(row => [row.cloudinary_public_id, cloudinaryId(row.cloudinary_url || "")]), ...(schools.data || []).map(row => cloudinaryId(row.logo_url || "")), ...(events.data || []).map(row => cloudinaryId(row.image_url || ""))].filter(Boolean) as string[]);
  const muxRefs = new Set<string>([...cms.mux_asset_ids, ...(assets.data || []).map(row => row.mux_asset_id)].filter(Boolean) as string[]);
  const documentRefs = new Set((documents.data || []).filter(row => row.storage_bucket === "source-documents").map(row => row.storage_path));
  const old = cutoff(); const candidates: Candidate[] = [];
  for (const asset of cloudinary) if (asset.public_id?.startsWith("krtr/") && Date.parse(asset.created_at) < old && !cloudRefs.has(asset.public_id)) candidates.push({ provider: "cloudinary", id: asset.public_id, created_at: asset.created_at, bytes: asset.bytes });
  for (const asset of mux) if (String(asset.passthrough || "").startsWith("nrcs_asset:") && Number(asset.created_at) * 1000 < old && !muxRefs.has(asset.id)) candidates.push({ provider: "mux", id: asset.id, created_at: new Date(Number(asset.created_at) * 1000).toISOString() });
  for (const file of files) if (Date.parse(file.created_at) < old && !documentRefs.has(file.path)) candidates.push({ provider: "supabase", id: file.path, created_at: file.created_at, bytes: file.metadata?.size });
  return { generated_at: new Date().toISOString(), retention_days: RETENTION_DAYS, candidates: candidates.sort((a,b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id)), protected_counts: { cloudinary: cloudRefs.size, mux: muxRefs.size, documents: documentRefs.size }, scanned_counts: { cloudinary: cloudinary.length, mux: mux.length, documents: files.length } };
}
export async function deleteOrphanMedia(expectedCount: number) {
  const audit = await auditOrphanMedia(); if (audit.candidates.length !== expectedCount) throw new Error("The candidate set changed. Run a new audit before deleting.");
  const { cloudName, apiKey, apiSecret } = getCloudinaryCredentials(); const cloudAuth = "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64"); const muxAuth = muxAuthHeader(); const db = createNrcsServiceClient();
  const deleted: Candidate[] = [];
  for (const item of audit.candidates) {
    let response: Response | null = null;
    if (item.provider === "cloudinary") response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload?${new URLSearchParams({ "public_ids[]": item.id })}`, { method: "DELETE", headers: { Authorization: cloudAuth }, signal: AbortSignal.timeout(20000) });
    else if (item.provider === "mux") { if (!muxAuth) throw new Error("Mux credentials are missing."); response = await fetch(`https://api.mux.com/video/v1/assets/${encodeURIComponent(item.id)}`, { method: "DELETE", headers: { Authorization: muxAuth }, signal: AbortSignal.timeout(20000) }); }
    else { const result = await db.storage.from("source-documents").remove([item.id]); if (result.error) throw new Error(`Supabase ${item.id}: ${result.error.message}`); deleted.push(item); continue; }
    if (!response.ok) throw new Error(`${item.provider} ${item.id} deletion failed (${response.status}).`); deleted.push(item);
  }
  return { audit, deleted };
}
