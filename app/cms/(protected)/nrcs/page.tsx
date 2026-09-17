import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function NrcsReceipts({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const supabase = await createServerSupabase();
  const page = Math.max(0, Math.min(100000, Math.floor(Number(params.page) || 0)));
  let query = supabase.from("nrcs_publication_projections").select("id,kind,source_id,district_key,revision,received_at,package", { count: "exact" }).order("received_at", { ascending: false }).order("id").range(page * 25, page * 25 + 24);
  if (params.district) query = query.eq("district_key", params.district);
  if (["web", "homepage", "alert"].includes(params.kind || "")) query = query.eq("kind", params.kind);
  const { data, error, count } = await query;
  const { data: districts } = await supabase.from("districts").select("district_key,display_name").order("display_name");
  return <div className="grid gap-5"><h1 className="text-2xl font-semibold">NRCS Receipts</h1><p className="border-l-4 border-yellow-500 bg-yellow-50 p-3 text-sm">Received packages are non-public. Legacy public content is unchanged.</p><form className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">District<select name="district" defaultValue={params.district || ""} className="rounded border p-2"><option value="">All districts</option>{districts?.map(d => <option key={d.district_key} value={d.district_key}>{d.display_name}</option>)}</select></label><label className="grid gap-1 text-sm">Kind<select name="kind" defaultValue={params.kind || ""} className="rounded border p-2"><option value="">All</option><option value="web">Web Output</option><option value="homepage">Homepage</option><option value="alert">Priority Alert</option></select></label><button className="rounded bg-neutral-900 px-4 py-2 text-sm text-white">Apply</button></form>{error ? <p role="alert" className="text-red-800">{error.message}</p> : <div className="divide-y border-y">{data?.map(row => <Link key={row.id} href={`/cms/nrcs/${row.id}`} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><span className="break-words font-semibold">{row.package?.payload?.title || row.package?.payload?.headline || "Homepage lineup"}</span><span>{row.district_key} · {row.kind} · Revision {row.revision} · Received non-public</span></Link>)}{!data?.length && <p className="py-4 text-sm text-neutral-600">No received packages.</p>}</div>}{(count || 0) > (page + 1) * 25 && <Link className="w-fit underline" href={`/cms/nrcs?${new URLSearchParams({ district: params.district || "", kind: params.kind || "", page: String(page + 1) })}`}>Next Page</Link>}</div>;
}
