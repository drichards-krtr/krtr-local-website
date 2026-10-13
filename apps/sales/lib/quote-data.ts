import "server-only";
import {allRows} from "./collections";
import {requireSalesIdentity} from "./auth";
export async function quoteEditorData(org:string){
 const identity=await requireSalesIdentity();const s=identity.supabase;
 const [organization,bindings,products,shows,studios]=await Promise.all([
 s.from("sales_organizations").select("id,company_name").eq("id",org).single(),
 allRows((a,b)=>s.from("sales_organization_districts").select("district_key,sales_districts(name)").eq("organization_id",org).order("district_key").range(a,b)),
 allRows((a,b)=>s.from("sales_products").select("code,name").eq("active",true).order("code").range(a,b)),
 allRows((a,b)=>s.from("sales_shows").select("id,name,district_key").order("id").range(a,b)),
 allRows((a,b)=>s.from("sales_studios").select("id,name,district_key").order("id").range(a,b))]);
 if(organization.error)throw new Error("Organization unavailable.");
 const districts=bindings.map(d=>({district_key:d.district_key,name:(d.sales_districts as unknown as {name:string})?.name||d.district_key}));
 return {identity,organization:organization.data,products,districts,shows,studios};
}
