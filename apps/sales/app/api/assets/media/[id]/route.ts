import {createHash} from "node:crypto";
import {getSalesIdentity} from "@/lib/auth";
import {privateImageBytes} from "@/lib/asset-media";
export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const identity=await getSalesIdentity();if(!identity)return new Response("Unauthorized",{status:401});const {id}=await params;
 const {data:m,error}=await identity.supabase.from("sales_asset_media").select("public_id,format,sha256").eq("id",id).single();if(error)return new Response("Image unavailable",{status:404});
 try{const bytes=await privateImageBytes(m.public_id,m.format);if(createHash("sha256").update(bytes).digest("hex")!==m.sha256)return new Response("Retained image changed; material must be reviewed again.",{status:409});return new Response(new Uint8Array(bytes),{headers:{"Content-Type":m.format==="jpg"?"image/jpeg":"image/"+m.format,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});}catch{return new Response("Private image temporarily unavailable",{status:503});}
}
