import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { sanitizePublicationHtml } from "@/lib/nrcsPublication";
import { validatePublication } from "@/apps/nrcs/lib/editorialContract";
import NrcsArticleMedia from "@/components/cms/NrcsArticleMedia";
import MuxPlayer from "@/components/public/MuxPlayer";

export default async function NrcsPreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createServerSupabase();
  const { data: row, error } = await supabase.from("nrcs_publication_projections").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) notFound();
  const envelope = validatePublication(row.package);
  const { data: receipts } = await supabase.from("nrcs_publication_receipts").select("request_id,received_at").eq("projection_id", id).order("received_at", { ascending: false }).limit(25);
  return <div className="mx-auto grid max-w-4xl gap-5"><Link href="/cms/nrcs" className="w-fit text-sm underline">Back to NRCS Receipts</Link><h1 className="text-2xl font-semibold">Non-Public Preview</h1><p className="border-l-4 border-yellow-500 bg-yellow-50 p-3 text-sm">{row.district_key} · {row.kind} · Revision {row.revision} · Received, not published</p>
    {envelope.kind === "web" && <><div className="flex flex-wrap gap-2 text-sm text-neutral-600"><span>{envelope.payload.category?.name}</span>{envelope.payload.tags.map(t => <span key={t.id}>{t.name}</span>)}</div><h2 className="break-words text-2xl font-semibold">{envelope.payload.title}</h2>{envelope.payload.tease && <p className="break-words">{envelope.payload.tease}</p>}{envelope.payload.video && <MuxPlayer playbackId={envelope.payload.video.playback_id} poster={envelope.payload.video.thumbnail_url} orientation={envelope.payload.video.orientation} />}<NrcsArticleMedia images={envelope.payload.article_media} /><div className="rich-text break-words" dangerouslySetInnerHTML={{ __html: sanitizePublicationHtml(envelope.payload.body_html) }} /><dl className="grid gap-2 border-t pt-4 text-sm"><dt>Requested status: {envelope.payload.status}</dt><dt>Planned slug: {envelope.payload.slug || "None"}</dt><dt className="break-all">Copy version: {envelope.payload.copy_version_id || "None"}</dt><dt>SEO title: {envelope.payload.seo_title || "None"}</dt><dt>SEO description: {envelope.payload.seo_description || "None"}</dt></dl></>}
    {envelope.kind === "alert" && <section className="grid min-h-48 content-center gap-3 border-l-4 border-yellow-500 bg-yellow-50 p-5"><h2 className="break-words text-xl font-semibold">{envelope.payload.headline}</h2><p className="whitespace-pre-wrap break-words">{envelope.payload.message}</p><p className="text-sm">{envelope.payload.active ? "Enabled" : "Disabled"} · Starts: {envelope.payload.start_at || "Immediately"} · Ends: {envelope.payload.end_at || "No end"}</p><p className="break-all text-sm">Target: {envelope.payload.target_type} {envelope.payload.target_id || envelope.payload.external_url || ""}</p></section>}
    {envelope.kind === "homepage" && <section className="grid gap-4"><h2 className="text-lg font-semibold">Homepage Lineup · {envelope.payload.timezone}</h2><p className="break-all text-sm">Hero Output: {envelope.payload.hero_output_id || "None"}</p><ol className="list-inside list-decimal break-all text-sm">{envelope.payload.top_output_ids.map(output => <li key={output}>{output}</li>)}</ol>{envelope.payload.daily && <><h3 className="font-semibold">{envelope.payload.daily.title} · {envelope.payload.daily.program_name}</h3><p className="text-sm">Daily publication date: {envelope.payload.daily.publication_date}</p>{envelope.payload.daily.asset.asset_type === "video" ? <MuxPlayer playbackId={envelope.payload.daily.asset.playback_id} orientation={envelope.payload.daily.asset.orientation} /> : <img className="aspect-video w-full object-contain" alt={envelope.payload.daily.asset.title} src={envelope.payload.daily.asset.url} />}</>}</section>}
    <section className="border-t pt-4"><h2 className="mb-2 font-semibold">Delivery Receipts</h2>{receipts?.map(receipt => <p key={receipt.request_id} className="break-all py-1 text-xs">{receipt.request_id} · {receipt.received_at}</p>)}</section></div>;
}
