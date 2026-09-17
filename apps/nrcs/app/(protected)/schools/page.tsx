import { notFound } from "next/navigation";
import { requireNrcsStaff } from "@/lib/auth";
import { createNrcsServerClient } from "@/lib/server";
import { getNrcsDistrictContext } from "@/lib/districts";
import type { SchoolIdentity } from "@/lib/graphics";
import NrcsSchoolManager from "@/components/NrcsSchoolManager";
export default async function SchoolsPage({searchParams}:{searchParams:Promise<{district?:string}>}) {
  await requireNrcsStaff("editor");
  const query=await searchParams;
  const {activeDistrict,allowedDistricts}=await getNrcsDistrictContext();
  const districtKey=query.district||activeDistrict?.district_key||"dlpc";
  if(!allowedDistricts.some(d=>d.district_key===districtKey))notFound();
  const supabase=await createNrcsServerClient();
  const [schools,selection]=await Promise.all([
    supabase.from("nrcs_school_identities").select("*").order("display_name"),
    supabase.from("nrcs_district_schools").select("school_id,is_default").eq("district_key",districtKey),
  ]);
  if(schools.error||selection.error)throw new Error(schools.error?.message||selection.error?.message);
  return <div className="grid gap-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Schools &amp; Co-ops</h1><form className="flex gap-2"><select name="district" defaultValue={districtKey} className="rounded border border-neutral-300 px-3 py-2 text-sm">{allowedDistricts.map(d=><option key={d.district_key} value={d.district_key}>{d.display_name}</option>)}</select><button className="rounded border border-neutral-300 px-3 py-2 text-sm">Apply</button></form></header>
    <NrcsSchoolManager key={districtKey} districtKey={districtKey} initialSchools={(schools.data||[]) as SchoolIdentity[]} selection={selection.data||[]}/>
  </div>;
}
