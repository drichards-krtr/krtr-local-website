"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
export default function AssetUploader({assetId,purpose}:{assetId:string;purpose:"logo"|"artwork"}){
 const [file,setFile]=useState<File|null>(null);const [busy,setBusy]=useState(false);const [status,setStatus]=useState("");const router=useRouter();
 async function upload(){if(!file||busy)return;setBusy(true);setStatus("");const uploadId=crypto.randomUUID();try{
 if(file.size>8*1024*1024)throw new Error("Choose an image up to 8 MB.");
 const request=async(action:string)=>{const response=await fetch("/api/assets/uploads",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,assetId,purpose,uploadId})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Upload request failed.");return data;};
 const recipe=await request("begin");const body=new FormData();for(const [key,value] of Object.entries(recipe.parameters))body.set(key,String(value));body.set("file",file);
 const response=await fetch(recipe.url,{method:"POST",body});if(!response.ok)throw new Error("Cloudinary did not accept the file. Retry or contact your salesperson.");await request("complete");setStatus("Uploaded and verified. Select it in the form below.");setFile(null);router.refresh();
 }catch(e){setStatus(e instanceof Error?e.message:"Upload failed.");}finally{setBusy(false);}}
 return <section className="card"><h3>{purpose==="logo"?"Advertiser-supplied logo":"Finished artwork"}</h3><label>PNG, JPEG or WebP · maximum 8 MB<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>setFile(e.target.files?.[0]||null)}/></label><button type="button" disabled={!file||busy} onClick={upload}>{busy?"Uploading & checking…":"Upload image"}</button>{status&&<p role="status">{status}</p>}</section>;
}
