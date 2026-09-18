import Link from "next/link";
import { requireNrcsStaff } from "@/lib/auth";
import { createNrcsServerClient } from "@/lib/server";
import { getNrcsDistrictContext } from "@/lib/districts";
import NrcsPublicationDelivery from "@/components/NrcsPublicationDelivery";

export default async function Publishing({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireNrcsStaff("editor");
  const params = await searchParams;
  const context = await getNrcsDistrictContext();
  const district = context.allowedDistricts.find(d => d.district_key === params.district) || context.activeDistrict;
  if (!district) return <p>No accessible district.</p>;
  const page = Math.max(0, Math.min(100000, Math.floor(Number(params.page) || 0)));
  const supabase = await createNrcsServerClient();
  let query = supabase.from("nrcs_publication_deliveries").select("request_id,kind,source_id,revision,status,updated_at,package", { count: "exact" }).eq("district_key", district.district_key).order("updated_at", { ascending: false }).order("request_id").range(page * 25, page * 25 + 24);
  if (["pending", "sending", "failed", "received"].includes(params.status || "")) query = query.eq("status", params.status);
  const { data, error, count } = await query;
  return <div className="grid gap-5"><h1 className="text-2xl font-semibold">CMS Deliveries</h1><form className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">District<select className="rounded border p-2" name="district" defaultValue={district.district_key}>{context.allowedDistricts.map(d => <option key={d.district_key} value={d.district_key}>{d.display_name}</option>)}</select></label><label className="grid gap-1 text-sm">Status<select name="status" defaultValue={params.status || ""} className="rounded border p-2"><option value="">All</option><option value="failed">Failed</option><option value="sending">Sending</option><option value="pending">Pending</option><option value="received">Received</option></select></label><button className="rounded bg-neutral-900 px-4 py-2 text-sm text-white">Apply</button></form>{error && <p role="alert" className="text-red-800">{error.message}</p>}<div className="divide-y border-y">{data?.map(row => <section key={row.request_id} className="grid gap-3 py-4"><div className="flex flex-wrap justify-between gap-2"><h2 className="break-words font-semibold">{row.package?.payload?.title || row.package?.payload?.headline || "Homepage lineup"}</h2><Link className="text-sm underline" href={row.kind === "web" ? `/outputs/${row.package.payload.story_id}` : `/homepage?district=${district.district_key}`}>Open Editor</Link></div><p className="text-xs text-neutral-600">{row.kind} · Revision {row.revision}</p><NrcsPublicationDelivery kind={row.kind} sourceId={row.source_id} revision={row.revision} districtKey={district.district_key} /></section>)}{!data?.length && <p className="py-4 text-sm text-neutral-600">No deliveries.</p>}</div>{(count || 0) > (page + 1) * 25 && <Link className="w-fit underline" href={`/publishing?${new URLSearchParams({ district: district.district_key, status: params.status || "", page: String(page + 1) })}`}>Next Page</Link>}</div>;
}
