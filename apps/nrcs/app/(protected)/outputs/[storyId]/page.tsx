import Link from "next/link";
import { notFound } from "next/navigation";
import { requireNrcsStaff } from "@/lib/auth";
import { createNrcsServerClient } from "@/lib/server";
import { getNrcsDistrictContext } from "@/lib/districts";
import NrcsOutputEditor from "@/components/NrcsOutputEditor";
import type { OutputAsset, OutputVersion, SocialOutput, WebOutput } from "@/lib/outputs";
import { sanitizeRichTextHtml } from "@/lib/richText";

export default async function OutputPage({ params }: { params: Promise<{ storyId: string }> }) {
  const { storyId } = await params;
  const { profile } = await requireNrcsStaff();
  const supabase = await createNrcsServerClient();
  const { data: story, error } = await supabase.from("nrcs_stories").select("id,title,district_key,created_by").eq("id", storyId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!story || profile.role === "contributor" && story.created_by !== profile.id) notFound();
  const districtContext = await getNrcsDistrictContext();
  const district = districtContext.allowedDistricts.find(d => d.district_key === story.district_key);
  if (!district) notFound();
  const results = await Promise.all([
    supabase.from("nrcs_copy_streams").select("id,stream_type,current_version_id").eq("story_id", storyId).in("stream_type", ["web", "social"]),
    supabase.from("nrcs_web_outputs").select("*").eq("story_id", storyId).maybeSingle(),
    supabase.from("nrcs_social_outputs").select("*").eq("story_id", storyId).order("created_at", { ascending: false }),
    supabase.from("nrcs_story_assets").select("nrcs_assets(id,title,asset_type,cloudinary_url,thumbnail_url,mux_status,mux_playback_id)").eq("story_id", storyId),
  ]);
  for (const result of results) if (result.error) throw new Error(result.error.message);
  const streams = results[0].data || [];
  const streamIds = streams.map(s => s.id);
  const versionResult = streamIds.length ? await supabase.from("nrcs_copy_versions").select("id,stream_id,version_number,headline,body_html,created_at").in("stream_id", streamIds).order("version_number", { ascending: false }) : { data: [], error: null };
  if (versionResult.error) throw new Error(versionResult.error.message);
  const web = results[1].data as WebOutput | null;
  const mediaResult = web ? await supabase.from("nrcs_web_output_media").select("asset_id").eq("output_id", web.id).order("position") : { data: [], error: null };
  if (mediaResult.error) throw new Error(mediaResult.error.message);
  const versions = (kind: string) => (versionResult.data || []).filter(v => v.stream_id === streams.find(s => s.stream_type === kind)?.id).map(v => ({ ...v, body_html: sanitizeRichTextHtml(v.body_html) })) as OutputVersion[];
  const assets = (results[3].data || []).flatMap(l => Array.isArray(l.nrcs_assets) ? l.nrcs_assets : l.nrcs_assets ? [l.nrcs_assets] : []) as OutputAsset[];
  return <div className="grid gap-5"><div><Link className="text-sm underline" href={`/stories/${storyId}?district=${encodeURIComponent(story.district_key)}`}>Back to Story</Link><h1 className="mt-2 text-2xl font-semibold">{story.title}</h1><p className="text-sm text-neutral-500">Outputs · {district.display_name} · {district.timezone}</p></div>
    <NrcsOutputEditor storyId={storyId} districtKey={story.district_key} timezone={district.timezone} editor={profile.role !== "contributor"} initialWeb={web} initialSocial={results[2].data as SocialOutput[] || []} webVersions={versions("web")} socialVersions={versions("social")} assets={assets} initialMedia={(mediaResult.data || []).map(m => m.asset_id)} />
  </div>;
}
