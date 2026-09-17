"use client";
import { useRef, useState } from "react";
import NrcsCloudinaryImageField from "./NrcsCloudinaryImageField";
import type { SchoolIdentity } from "@/lib/graphics";
const fieldClass = "rounded border border-neutral-300 px-3 py-2 text-sm";
export default function NrcsSchoolManager({initialSchools,selection,districtKey}:{
  initialSchools:SchoolIdentity[];selection:Array<{school_id:string;is_default:boolean}>;districtKey:string;
}) {
  const [schools,setSchools]=useState(initialSchools);
  const [selected,setSelected]=useState(selection.map(row=>row.school_id));
  const [defaultId,setDefaultId]=useState(selection.find(row=>row.is_default)?.school_id||"");
  const [editing,setEditing]=useState<SchoolIdentity|null|undefined>(undefined);
  const [kind,setKind]=useState<"school"|"coop">("school");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const mutationId=useRef(crypto.randomUUID());
  const createId=useRef(crypto.randomUUID());
  const lock=useRef(false);
  async function request(body:Record<string,unknown>) {
    const response=await fetch("/api/graphics/schools",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
    const result=await response.json();
    if(!response.ok) throw new Error(result.error||"Save failed.");
    if(result.school) setSchools(current=>[...current.filter(row=>row.id!==result.school.id),result.school].sort((a,b)=>a.display_name.localeCompare(b.display_name)));
    return result;
  }
  async function run(work:()=>Promise<void>) {
    if(lock.current)return;lock.current=true;setBusy(true);setError("");setMessage("");
    try {await work();mutationId.current=crypto.randomUUID();}
    catch(failure){setError(failure instanceof Error?failure.message:"Action failed.");}
    finally{lock.current=false;setBusy(false);}
  }
  function open(school:SchoolIdentity|null,nextKind:"school"|"coop") {
    setEditing(school);setKind(nextKind);createId.current=crypto.randomUUID();mutationId.current=crypto.randomUUID();setError("");setMessage("");
  }
  async function save(fields:FormData) {
    await run(async()=>{
      await request({operation:"save",id:editing?.id||createId.current,requestId:mutationId.current,kind,
        name:fields.get("name"),mascot:fields.get("mascot"),displayName:fields.get("display_name"),
        logoUrl:fields.get("logo_url"),primaryId:fields.get("primary_id"),partnerId:fields.get("partner_id")});
      setMessage("Identity saved.");setEditing(undefined);
    });
  }
  const filtered=schools.filter(row=>row.display_name.toLowerCase().includes(search.toLowerCase()));
  return <div className="grid gap-6">
    {message&&<p role="status" className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">{message}</p>}
    {error&&<p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-3">
      <button disabled={busy} onClick={()=>open(null,"school")} className={fieldClass}>Create School</button>
      <button disabled={busy} onClick={()=>open(null,"coop")} className={fieldClass}>Create Co-op</button>
      {schools.some(row=>row.legacy_logo_path&&!row.logo_url)&&<button disabled={busy} onClick={()=>void run(async()=>{
        const pending=schools.filter(row=>row.legacy_logo_path&&!row.logo_url);
        for(let i=0;i<pending.length;i++){setMessage(`Importing logo ${i+1} of ${pending.length}: ${pending[i].display_name}`);await request({operation:"import",id:pending[i].id});}
        setMessage("Original logos imported to shared Cloudinary library.");
      })} className={fieldClass}>{busy?"Working...":"Import Original Logos to Cloudinary"}</button>}
    </div>
    {editing!==undefined&&<section className="grid gap-4 border-b border-neutral-300 pb-6">
      <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{editing?"Edit":"Create"} {kind==="school"?"School":"Co-op"}</h2><button disabled={busy} onClick={()=>setEditing(undefined)} className={fieldClass}>Cancel</button></div>
      <form key={editing?.id||createId.current} action={save} className="grid gap-4">
        <fieldset disabled={busy} className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm">Name<input name="name" required maxLength={160} defaultValue={editing?.name||""} className={fieldClass}/></label>
          <label className="grid gap-1 text-sm">Mascot<input name="mascot" required maxLength={160} defaultValue={editing?.mascot||""} className={fieldClass}/></label>
          <label className="grid gap-1 text-sm">Display Name<input name="display_name" required maxLength={160} defaultValue={editing?.display_name||""} className={fieldClass}/></label>
          {kind==="school"?<div className="md:col-span-3"><NrcsCloudinaryImageField name="logo_url" label="Transparent PNG Logo" initialUrl={editing?.logo_url} originalImage/>{editing?.legacy_logo_path&&!editing.logo_url&&<img src={editing.legacy_logo_path} alt={editing.display_name} className="mt-2 h-24 w-24 object-contain"/>}</div>:
            <>{(["primary","partner"] as const).map(role=><label key={role} className="grid gap-1 text-sm capitalize">{role} School<select name={role+"_id"} required defaultValue={editing?.[role==="primary"?"primary_school_id":"partner_school_id"]||""} className={fieldClass}><option value="">Select school</option>{schools.filter(row=>row.kind==="school").map(row=><option key={row.id} value={row.id}>{row.display_name}</option>)}</select></label>)}</>}
          <button className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">{busy?"Saving...":"Save Identity"}</button>
        </fieldset>
      </form>
    </section>}
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">District Schools</h2><label className="flex items-center gap-2 text-sm">Search<input type="search" value={search} onChange={event=>setSearch(event.target.value)} className={fieldClass}/></label></div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">Default School<select disabled={busy} value={defaultId} onChange={event=>setDefaultId(event.target.value)} className={fieldClass}><option value="">None</option>{schools.filter(row=>selected.includes(row.id)).map(row=><option key={row.id} value={row.id}>{row.display_name}</option>)}</select></label>
        <button disabled={busy} onClick={()=>void run(async()=>{await request({operation:"district",districtKey,schoolIds:selected,defaultId});setMessage("District school selections saved.");})} className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Save District Selections</button>
      </div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-neutral-300"><th className="p-2">Use</th><th className="p-2">Logo</th><th className="p-2">Identity</th><th className="p-2">Actions</th></tr></thead>
        <tbody>{filtered.map(school=><tr key={school.id} className="border-b border-neutral-200">
          <td className="p-2"><input type="checkbox" aria-label={`Use ${school.display_name} in district`} disabled={busy} checked={selected.includes(school.id)} onChange={event=>{setSelected(current=>event.target.checked?[...current,school.id]:current.filter(id=>id!==school.id));if(!event.target.checked&&defaultId===school.id)setDefaultId("");}}/></td>
          <td className="p-2"><img src={school.logo_url||school.legacy_logo_path||""} alt="" className="h-14 w-14 object-contain"/></td>
          <td className="p-2"><div className="font-medium">{school.display_name}</div><div className="text-xs capitalize text-neutral-500">{school.kind} - {school.mascot || "Mascot not set"}</div></td>
          <td className="p-2"><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={()=>open(school,school.kind)} className={fieldClass}>Edit</button>
          {school.kind==="coop"&&<button disabled={busy} onClick={()=>void run(async()=>{await request({operation:"regenerate",id:school.id,requestId:mutationId.current});setMessage("Co-op logo regenerated and saved to Cloudinary.");})} className={fieldClass}>Regenerate Logo</button>}</div></td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>;
}
