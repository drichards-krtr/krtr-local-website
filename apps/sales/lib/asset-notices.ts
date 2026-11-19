import "server-only";
import {createSalesAdminClient} from "./admin";
import {getSalesSiteUrl} from "./env";
const escape=(s:string)=>s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
export async function deliverAssetNotices(){
 const key=process.env.RESEND_API_KEY;const from=process.env.SALES_EMAIL_FROM;
 if(!key||!from||!process.env.SALES_SUPABASE_SERVICE_ROLE_KEY)return {state:"unconfigured",sent:0};
 const client=createSalesAdminClient();const {data,error}=await client.rpc("sales_claim_asset_notices");if(error)return {state:"failed",sent:0};
 let sent=0;for(const n of data||[]){let ok=false,provider:string|null=null;try{
 const url=new URL(n.action_path,getSalesSiteUrl()).href;
 const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json","Idempotency-Key":`sales-asset-${n.id}`},body:JSON.stringify({from,to:[n.email],subject:n.subject,text:n.message+"\n\n"+url,html:`<p>${escape(n.message)}</p><p><a href="${escape(url)}">Open Sales action</a></p>`}),signal:AbortSignal.timeout(10000)});
 const result=await response.json();ok=response.ok&&!!result.id;provider=ok?result.id:null;
 }catch{/* Persist a safe failure, never credentials or raw provider payloads. */}
 await client.rpc("sales_finish_asset_notice",{p_id:n.id,p_token:n.claim_token,p_sent:ok,p_provider:provider,p_error:ok?null:"Email delivery did not confirm; scheduled retry required."});if(ok)sent++;
 }return {state:"processed",sent};
}
