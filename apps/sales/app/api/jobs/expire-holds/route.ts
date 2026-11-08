import {timingSafeEqual} from "node:crypto";
import {createSalesAdminClient} from "@/lib/admin";
export const runtime="nodejs";
export async function GET(request:Request){
 const secret=process.env.SALES_CRON_SECRET;const actual=request.headers.get("authorization")||"";const expected="Bearer "+secret;
 if(!secret||secret.length<32||Buffer.byteLength(actual)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return Response.json({error:"Unauthorized"},{status:401});
 try{const {data,error}=await createSalesAdminClient().rpc("sales_expire_all_holds");if(error)throw error;return Response.json({expired:data});}catch{return Response.json({error:"Hold expiry failed; retry required."},{status:503});}
}
