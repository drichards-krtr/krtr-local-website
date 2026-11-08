"use server";
import {randomUUID} from "node:crypto";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {requireSalesIdentity} from "./auth";
import {centsFromInput} from "./quote-format.mjs";
const value=(f:FormData,k:string)=>String(f.get(k)||"").trim();
const checked=(f:FormData,k:string)=>f.get(k)==="on";
function finish(path:string,error?:{message:string}|null):never{for(const p of [path,"/dashboard","/finance","/agreements","/inventory","/ledger"])revalidatePath(p);redirect(path+"?"+(error?"error="+encodeURIComponent(error.message):"notice=saved"));}
export async function signAgreement(form:FormData){
 const {supabase}=await requireSalesIdentity();const quote=value(form,"quote_id");
 const {data,error}=await supabase.rpc("sales_sign_quote",{p_quote:quote,p_version:Number(form.get("version")),p_key:value(form,"request_id"),p_name:value(form,"name"),p_consent:checked(form,"consent")});
 finish(error?`/quotes/${quote}`:`/agreements/${data}`,error);
}
export async function recordPaperAgreement(form:FormData){
 const {supabase,user,isSalesStaff}=await requireSalesIdentity();const quote=value(form,"quote_id");const path=`/quotes/${quote}`;
 if(!isSalesStaff)finish(path,{message:"Authorized sales staff required."});
 const {data:q,error:qError}=await supabase.from("sales_quotes").select("organization_id").eq("id",quote).single();if(qError)finish(path,qError);
 const file=form.get("signed_pdf");
 if(!(file instanceof File)||file.size===0||file.size>10*1024*1024||file.type!=="application/pdf")finish(path,{message:"Upload a signed PDF up to 10 MB."});
 const bytes=new Uint8Array(await file.arrayBuffer());if(new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")finish(path,{message:"The uploaded file must be a PDF."});
 const objectName=`${q!.organization_id}/${user.id}/${randomUUID()}.pdf`;
 const {error:uploadError}=await supabase.storage.from("sales-agreements").upload(objectName,bytes,{contentType:"application/pdf",upsert:false});if(uploadError)finish(path,uploadError);
 const {data,error}=await supabase.rpc("sales_sign_quote",{p_quote:quote,p_version:Number(form.get("version")),p_key:value(form,"request_id"),p_name:value(form,"name"),p_consent:checked(form,"consent"),p_method:"paper",p_signed_on:value(form,"signed_on"),p_paper_ref:objectName});
 finish(error?path:`/agreements/${data}`,error);
}
export async function receiveCheck(form:FormData){const {supabase}=await requireSalesIdentity();const {error}=await supabase.rpc("sales_receive_check",{p_invoice:value(form,"invoice_id"),p_key:value(form,"request_id"),p_reference:value(form,"reference"),p_on:value(form,"on_date")});finish("/finance",error);}
export async function updateCheck(form:FormData){const {supabase}=await requireSalesIdentity();const {error}=await supabase.rpc("sales_update_check",{p_check:value(form,"check_id"),p_action:value(form,"intent"),p_on:value(form,"on_date")});finish("/finance",error);}
export async function expireHolds(){const {supabase}=await requireSalesIdentity();const {error}=await supabase.rpc("sales_expire_holds");finish("/finance",error);}
export async function ownerMovement(form:FormData){const {supabase}=await requireSalesIdentity();let amount;try{amount=centsFromInput(value(form,"amount"));}catch(e){finish("/ledger",{message:(e as Error).message});}const {error}=await supabase.rpc("sales_record_owner_movement",{p_allocation:value(form,"allocation_id"),p_key:value(form,"request_id"),p_kind:value(form,"kind"),p_cents:amount,p_on:value(form,"on_date"),p_reference:value(form,"reference")});finish("/ledger",error);}
export async function takeoverAllocation(form:FormData){const {supabase}=await requireSalesIdentity();let basis;try{basis=centsFromInput(value(form,"basis"));}catch(e){finish("/ledger",{message:(e as Error).message});}const {error}=await supabase.rpc("sales_approve_takeover",{p_agreement:value(form,"agreement_id"),p_seller:value(form,"seller_id"),p_basis:basis,p_reason:value(form,"reason")});finish("/ledger",error);}
export async function configureFinance(form:FormData){const {supabase}=await requireSalesIdentity();const {error}=await supabase.rpc("sales_configure_finance",{p_payee:value(form,"payee"),p_mailing:value(form,"mailing"),p_dropoff:value(form,"dropoff")});finish("/settings/finance",error);}
export async function configurePayroll(form:FormData){const {supabase}=await requireSalesIdentity();const {error}=await supabase.rpc("sales_configure_payroll",{p_enabled:checked(form,"enabled"),p_anchor:value(form,"anchor")||null,p_cutoff:value(form,"cutoff")?Number(form.get("cutoff")):null,p_hiring:checked(form,"hiring"),p_employer:checked(form,"employer"),p_agreements:checked(form,"agreements")});finish("/settings/finance",error);}
export async function schedulePayroll(form:FormData){const {supabase}=await requireSalesIdentity();const {error}=await supabase.rpc("sales_schedule_payroll",{p_key:value(form,"request_id"),p_payday:value(form,"payday"),p_allocations:form.getAll("allocation_id").map(String)});finish("/ledger",error);}
export async function payrollPaid(form:FormData){const {supabase}=await requireSalesIdentity();const {error}=await supabase.rpc("sales_mark_payroll_paid",{p_run:value(form,"run_id"),p_on:value(form,"on_date"),p_reference:value(form,"reference")});finish("/ledger",error);}
