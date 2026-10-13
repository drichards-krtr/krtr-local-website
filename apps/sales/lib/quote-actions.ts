"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSalesIdentity } from "./auth";
import { centsFromInput, percentToBps } from "./quote-format.mjs";
const text=(form:FormData,key:string)=>String(form.get(key)||"").trim();
const checked=(form:FormData,key:string)=>form.get(key)==="on";
const id=(value:string)=>/^[0-9a-f-]{36}$/i.test(value)?value:"";
function finish(path:string,error?:{message:string}|null):never{revalidatePath("/quotes");revalidatePath("/dashboard");revalidatePath(path);redirect(`${path}?${error?"error="+encodeURIComponent(error.message):"notice=saved"}`);}
function parseJson(value:string){try{return JSON.parse(value);}catch{throw new Error("Enter valid JSON for the exact terms.");}}
export async function saveQuote(form:FormData){
 const {supabase}=await requireSalesIdentity();let lines;
 try{lines=parseJson(text(form,"lines"));}catch(e){finish("/quotes/new",{message:(e as Error).message});}
 const quote=id(text(form,"quote_id"));
 const {data,error}=await supabase.rpc("sales_save_quote",{p_org:text(form,"organization_id"),p_lines:lines,p_quote:quote||null,p_expected_version:quote?Number(form.get("version")):null,p_opportunity:text(form,"opportunity_id")||null});
 finish(error?(quote?`/quotes/${quote}`:"/quotes"): `/quotes/${data}`,error);
}
export async function applyQuoteOverride(form:FormData){
 const {supabase}=await requireSalesIdentity();const quote=id(text(form,"quote_id"));const version=Number(form.get("version"));
 const {data:header,error:headError}=await supabase.from("sales_quotes").select("organization_id").eq("id",quote).single();
 const {data:baseline,error:baseError}=await supabase.from("sales_quote_versions").select("content").eq("quote_id",quote).eq("version",version).single();
 if(headError||baseError)finish(`/quotes/${quote}`,{message:"Quote unavailable or changed."});
 const {error}=await supabase.rpc("sales_save_quote",{p_org:header!.organization_id,p_lines:baseline!.content.input_lines,p_quote:quote,p_expected_version:version,p_overrides:[text(form,"override_id")]});finish(`/quotes/${quote}`,error);
}
export async function publishQuote(form:FormData){const {supabase}=await requireSalesIdentity();const quote=id(text(form,"quote_id"));const {error}=await supabase.rpc("sales_publish_quote",{p_quote:quote,p_version:Number(form.get("version"))});finish(`/quotes/${quote}`,error);}
export async function withdrawQuote(form:FormData){const {supabase}=await requireSalesIdentity();const quote=id(text(form,"quote_id"));const {error}=await supabase.rpc("sales_withdraw_quote",{p_quote:quote});finish(`/quotes/${quote}`,error);}
export async function requestQuoteOverride(form:FormData){
 const {supabase}=await requireSalesIdentity();const quote=id(text(form,"quote_id"));let terms;
 try{terms=parseJson(text(form,"terms"));}catch(e){finish(`/quotes/${quote}`,{message:(e as Error).message});}
 const {error}=await supabase.rpc("sales_request_quote_override",{p_quote:quote,p_version:Number(form.get("version")),p_line:text(form,"line_id")||null,p_terms:terms,p_reason:text(form,"reason")});finish(`/quotes/${quote}`,error);
}
export async function decideQuoteOverride(form:FormData){const {supabase}=await requireSalesIdentity();const {error}=await supabase.rpc("sales_decide_quote_override",{p_id:text(form,"override_id"),p_approve:text(form,"intent")==="approve",p_reason:text(form,"reason")});finish("/quote-overrides",error);}
export async function configureTax(form:FormData){
 const {supabase}=await requireSalesIdentity();let bps;
 try{bps=percentToBps(text(form,"percent"));}catch(e){finish("/settings/commercial",{message:(e as Error).message});}
 const {error}=await supabase.rpc("sales_configure_tax",{p_district:text(form,"district_key"),p_label:text(form,"label"),p_bps:bps,p_advertising:checked(form,"advertising_taxable"),p_assets:checked(form,"asset_work_taxable")});finish("/settings/commercial",error);
}
export async function publishRate(form:FormData){
 const {supabase}=await requireSalesIdentity();let base,extra,deliverables;
 try{base=centsFromInput(text(form,"base_price"));extra=centsFromInput(text(form,"additional_day_price")||"0");deliverables=parseJson(text(form,"deliverables"));}catch(e){finish("/catalogue",{message:(e as Error).message});}
 const {error}=await supabase.rpc("sales_publish_product_version",{p_code:text(form,"product_code"),p_base:base,p_extra_day:extra,p_deliverables:deliverables});finish("/catalogue",error);
}
export async function publishPolicy(form:FormData){
 const {supabase}=await requireSalesIdentity();let terms;try{terms=parseJson(text(form,"terms"));}catch(e){finish("/catalogue",{message:(e as Error).message});}
 const {error}=await supabase.rpc("sales_publish_policy_version",{p_terms:terms});finish("/catalogue",error);
}
export async function configureStudio(form:FormData){const {supabase}=await requireSalesIdentity();const {error}=await supabase.rpc("sales_configure_studio",{p_district:text(form,"district_key"),p_name:text(form,"name"),p_show:text(form,"show_id")||null});finish("/settings/commercial",error);}
export async function addCalendarException(form:FormData){const {supabase}=await requireSalesIdentity();const {error}=await supabase.rpc("sales_set_calendar_exception",{p_date:text(form,"on_date"),p_label:text(form,"label")});finish("/settings/commercial",error);}
