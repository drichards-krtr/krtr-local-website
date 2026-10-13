import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const owner=uid(1),seller=uid(2),manager=uid(3),customer=uid(4),outsider=uid(5),agent=uid(6),regional=uid(7);
async function rpc(db,name,...args){return (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(",")}) result`,args)).rows[0].result;}
async function asUser(db,id,fn,commit=false,role="authenticated"){
 await db.exec("begin");try{await db.exec(`set local role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id||""]);const result=await fn();await db.exec(commit?"commit":"rollback");return result;}catch(e){await db.exec("rollback");throw e;}
}
async function quote(db,org,lines,id=null,v=null,overrides=[]){return asUser(db,seller,()=>rpc(db,"sales_save_quote",org,JSON.stringify(lines),id,v,overrides),true);}
async function content(db,id,v=null){return (await db.query("select content from sales_quote_versions where quote_id=$1 and ($2::int is null or version=$2) order by version desc limit 1",[id,v])).rows[0].content;}
const line=(code,start="2030-01-07",end="2030-01-20",extra={})=>({product_code:code,district_key:"dlpc",start_date:start,end_date:end,assets:[],...extra});
test("catalogue, quotes, taxes, deadlines and reservations in PostgreSQL",async t=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;grant usage on schema auth to anon,authenticated;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant execute on function auth.uid() to anon,authenticated;`);
 for(const f of ["20261012000100_sales_foundation.sql","20261012000200_customers_pipeline.sql","20261012000300_catalogue_quotes_inventory.sql"])await db.exec(await readFile(new URL("../supabase/migrations/"+f,import.meta.url),"utf8"));
 for(const id of [owner,seller,manager,customer,outsider,agent,regional])await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",[id,id+"@example.invalid"]);
 await db.exec("update sales_profiles set active=true");await db.query("insert into sales_owner(user_id) values($1)",[owner]);
 for(const [id,role] of [[seller,"salesperson"],[manager,"district_manager"],[agent,"production_agent"]])await db.query("insert into sales_staff_scopes(user_id,role,district_key) values($1,$2,'dlpc')",[id,role]);
 const org=await asUser(db,seller,()=>rpc(db,"sales_create_customer","Quote test customer","dlpc"),true);
 await db.query("insert into sales_organization_members(organization_id,user_id,can_sign_agreements) values($1,$2,true)",[org,customer]);
 await t.test("approved catalogue has 12 products and no removed/future extras",async()=>{assert.equal((await db.query("select * from sales_products")).rows.length,12);assert.equal((await db.query("select * from sales_products where code='P12'")).rows.length,0);});
 await t.test("unconfigured tax stays unavailable and blocks shared final terms",async()=>{const id=await quote(db,org,[line("P01","2030-01-07","2030-01-13")]);const data=await content(db,id);assert.equal(data.total_cents,null);assert.ok(data.warnings.includes("tax_not_configured"));await assert.rejects(asUser(db,seller,()=>rpc(db,"sales_publish_quote",id,1)),/Resolve quote warnings/);});
 await t.test("tax settings require a scoped manager",async()=>{await assert.rejects(asUser(db,seller,()=>rpc(db,"sales_configure_tax","dlpc","No tax",0,false,false)),/Sales Manager/);await asUser(db,manager,()=>rpc(db,"sales_configure_tax","dlpc","Explicit no tax",0,false,false),true);});
 await t.test("homepage minimum and exact additional-day cents",async()=>{const id=await quote(db,org,[line("P01","2030-01-07","2030-01-14")]);assert.equal((await content(db,id)).advertising_cents,11429);await assert.rejects(quote(db,org,[line("P01","2030-01-07","2030-01-12")]),/seven calendar days/);});
 await t.test("four ordinary Tuesdays are $100, never a five-day discount",async()=>{const id=await quote(db,org,[line("P05",undefined,undefined,{special_dates:["2030-01-08","2030-01-15","2030-01-22","2030-01-29"]})]);const data=await content(db,id);assert.equal(data.advertising_cents,10000);assert.equal(data.total_cents,10000);assert.equal(data.lines[0].specials_prices[0].discount_pct,0);});

 await t.test("five consecutive publication dates receive 10%, including holiday episodes",async()=>{
 const id=await quote(db,org,[line("P05",undefined,undefined,{special_dates:["2030-01-07","2030-01-08","2030-01-09","2030-01-10","2030-01-11"]})]);assert.equal((await content(db,id)).advertising_cents,11250);
 const holiday=await quote(db,org,[line("P05",undefined,undefined,{special_dates:["2030-01-21"]})]);assert.equal((await content(db,holiday)).advertising_cents,2500);
 const conflict=await quote(db,org,[line("P05",undefined,undefined,{special_dates:["2030-01-22"]})]);assert.ok((await content(db,conflict)).warnings.includes("specials_holiday_deadline_review"));
 });
 await t.test("show sponsor discount is larger and never stacks with five-day rate",async()=>{
 const show=(await db.query("select id from sales_shows")).rows[0].id;
 const id=await quote(db,org,[line("P04","2030-01-07","2030-02-03",{show_id:show}),line("P05",undefined,undefined,{show_id:show,special_dates:["2030-01-07","2030-01-08","2030-01-09","2030-01-10","2030-01-11"]})]);
 const data=await content(db,id);assert.equal(data.lines[0].advertising_cents,60000);assert.equal(data.lines[1].advertising_cents,10625);assert.deepEqual(data.lines[1].specials_prices.map(x=>x.discount_pct),[15,15,15,15,15]);
 });
 await t.test("block products and Sunday Calendar boundaries reject malformed dates",async()=>{
 for(const [code,expected] of [["P02",7500],["P03",5000],["P07",20000],["P08",20000],["P09",15000],["P10",15000],["P11",15000]]){const id=await quote(db,org,[line(code)]);assert.equal((await content(db,id)).advertising_cents,expected);await assert.rejects(quote(db,org,[line(code,"2030-01-07","2030-01-21")]),/whole two-week/);}
 const id=await quote(db,org,[line("P06","2030-01-06","2030-02-02")]);assert.equal((await content(db,id)).advertising_cents,30000);
 await assert.rejects(quote(db,org,[line("P06")]),/begin Sunday/);
 await assert.rejects(quote(db,org,[line("P04","2030-01-08","2030-01-21")]),/beginning Monday/);
 });
 await t.test("Studio is exactly three whole months and requires an actual configured studio",async()=>{
 await assert.rejects(quote(db,org,[line("P13","2030-01-01","2030-03-31")]),/actual studio/);
 const show=(await db.query("select id from sales_shows")).rows[0].id;
 const studio=await asUser(db,owner,()=>rpc(db,"sales_configure_studio","dlpc","Test studio",show),true);
 const id=await quote(db,org,[line("P13","2030-02-01","2030-04-30",{studio_id:studio})]);assert.equal((await content(db,id)).advertising_cents,150000);
 await assert.rejects(quote(db,org,[line("P13","2030-02-02","2030-04-30",{studio_id:studio})]),/three whole/);
 });
 await t.test("tax and product changes never rewrite historical quote versions",async()=>{
 const old=await quote(db,org,[line("P01","2030-01-07","2030-01-13",{assets:[{label:"Tuesday banner"}]})]);assert.equal((await content(db,old)).total_cents,11500);
 await asUser(db,manager,()=>rpc(db,"sales_configure_tax","dlpc","Test 7.25 percent",725,true,true),true);
 const taxed=await quote(db,org,[line("P01","2030-01-07","2030-01-13",{assets:[{label:"New banner"}]})]);assert.equal((await content(db,taxed)).tax_cents,834);assert.equal((await content(db,old)).tax_cents,0);
 await assert.rejects(db.query("update sales_quote_versions set content='{}' where quote_id=$1",[old]),/immutable/);
 await asUser(db,owner,()=>rpc(db,"sales_publish_product_version","P01",12000,1429,JSON.stringify({delivery:"Version 2 test banner",term:"Seven days"})),true);
 assert.equal((await content(db,old)).advertising_cents,10000);assert.equal((await content(db,await quote(db,org,[line("P01","2030-01-07","2030-01-13")]))).advertising_cents,12000);
 await asUser(db,owner,()=>rpc(db,"sales_publish_product_version","P01",10000,1429,JSON.stringify({delivery:"Restored test launch rate",term:"Seven days"})),true);
 await asUser(db,manager,()=>rpc(db,"sales_configure_tax","dlpc","Explicit no tax",0,false,false),true);
 });
 await t.test("asset fees count unique identities once, separate from advertising",async()=>{
 const asset=uid(1001);const id=await quote(db,org,[line("P02",undefined,undefined,{assets:[{id:asset,label:"Reusable banner"}]}),line("P03",undefined,undefined,{assets:[{id:asset,label:"Reusable banner"}]})]);const data=await content(db,id);assert.equal(data.advertising_cents,12500);assert.equal(data.asset_cents,1500);assert.equal(data.total_cents,14000);
 const revised=await quote(db,org,data.input_lines,id,1);assert.equal((await content(db,revised)).asset_cents,1500);assert.equal((await content(db,revised)).lines[0].assets[0].id,asset);
 });
 await t.test("observed federal holidays and DST produce correct Central deadlines",async()=>{
 assert.equal((await db.query("select sales_private.is_business_day('2027-12-31') value")).rows[0].value,false);
 assert.equal((await db.query("select sales_private.business_shift('2030-01-07',-5)::text value")).rows[0].value,"2029-12-28");
 const rows=(await db.query("select sales_private.central_deadline('2030-03-08') winter,sales_private.central_deadline('2030-03-11') summer")).rows[0];assert.ok(new Date(rows.winter).toISOString().includes("23:00"));assert.ok(new Date(rows.summer).toISOString().includes("22:00"));
 const a=await content(db,await quote(db,org,[line("P06","2030-01-06","2030-01-19")]));const b=await content(db,await quote(db,org,[line("P06","2030-01-20","2030-02-02")]));assert.equal(a.lines[0].valid_until_at,b.lines[0].valid_from_at);
 });
 await t.test("pending override blocks sharing and sellers cannot approve themselves",async()=>{
 const id=await quote(db,org,[line("P03")]);const data=await content(db,id);const request=await asUser(db,seller,()=>rpc(db,"sales_request_quote_override",id,1,data.lines[0].line_id,JSON.stringify({price_cents:4000}),"Customer requested trial price"),true);
 await assert.rejects(asUser(db,seller,()=>rpc(db,"sales_publish_quote",id,1)),/Pending overrides/);
 await assert.rejects(asUser(db,seller,()=>rpc(db,"sales_decide_quote_override",request,true,"Self approval")),/Scoped manager/);
 await asUser(db,manager,()=>rpc(db,"sales_decide_quote_override",request,true,"Authorized trial concession"),true);
 await quote(db,org,data.input_lines,id,1,[request]);assert.equal((await content(db,id)).advertising_cents,4000);
 await asUser(db,seller,()=>rpc(db,"sales_publish_quote",id,2),true);
 await asUser(db,customer,async()=>{assert.equal((await db.query("select * from sales_quote_versions where quote_id=$1",[id])).rows.length,1);assert.equal((await db.query("select * from sales_quote_overrides where quote_id=$1",[id])).rows.length,0);});
 });
 await t.test("changed approval baseline requires reapproval, and approval preserves tax/rate versions",async()=>{
 const id=await quote(db,org,[line("P03")]);const data=await content(db,id);const request=await asUser(db,seller,()=>rpc(db,"sales_request_quote_override",id,1,data.lines[0].line_id,JSON.stringify({price_cents:4500}),"Exact trial"),true);
 await asUser(db,manager,()=>rpc(db,"sales_decide_quote_override",request,true,"Approved exact dates"),true);
 await assert.rejects(quote(db,org,[{...data.input_lines[0],end_date:"2030-02-03"}],id,1,[request]),/baseline changed/);
 await asUser(db,manager,()=>rpc(db,"sales_configure_tax","dlpc","Later tax",1000,true,true),true);
 await quote(db,org,data.input_lines,id,1,[request]);assert.equal((await content(db,id)).tax_cents,0);
 await asUser(db,manager,()=>rpc(db,"sales_configure_tax","dlpc","No tax",0,false,false),true);
 });
 await t.test("unsigned proposals do not reserve and exclusive conflicts are checked at signing",async()=>{
 const other=await asUser(db,seller,()=>rpc(db,"sales_create_customer","Second advertiser","dlpc"),true);
 await db.query("insert into sales_organization_members(organization_id,user_id,can_sign_agreements) values($1,$2,true)",[other,customer]);
 const a=await quote(db,org,[line("P01","2030-03-04","2030-03-10")]);const b=await quote(db,other,[line("P01","2030-03-04","2030-03-10")]);
 await asUser(db,seller,()=>rpc(db,"sales_publish_quote",a,1),true);await asUser(db,seller,()=>rpc(db,"sales_publish_quote",b,1),true);
 assert.equal((await db.query("select * from sales_inventory_units")).rows.length,0);
 await assert.rejects(asUser(db,customer,()=>rpc(db,"sales_reserve_signed_quote",uid(2001))),/permission denied/);
 for(const [agreement,id] of [[uid(2001),a],[uid(2002),b]])await db.query("insert into sales_inventory_agreements(agreement_id,quote_id,version,signed_by,signed_at) values($1,$2,1,$3,now())",[agreement,id,customer]);
 await rpc(db,"sales_reserve_signed_quote",uid(2001));assert.equal((await db.query("select * from sales_inventory_units where agreement_id=$1",[uid(2001)])).rows.length,7);
 await assert.rejects(rpc(db,"sales_reserve_signed_quote",uid(2002)),/Inventory conflict/);assert.equal((await db.query("select * from sales_inventory_units where agreement_id=$1",[uid(2002)])).rows.length,0);
 assert.equal((await rpc(db,"sales_reserve_signed_quote",uid(2001))).already_reserved,true);
 await db.query("update sales_inventory_units set hold_until=now()-interval '1 second' where agreement_id=$1",[uid(2001)]);
 await assert.rejects(rpc(db,"sales_reserve_signed_quote",uid(2001)),/cannot be silently reactivated/);
 await rpc(db,"sales_reserve_signed_quote",uid(2002));assert.equal((await db.query("select state from sales_inventory_units where agreement_id=$1 limit 1",[uid(2001)])).rows[0].state,"released");
 });
 await t.test("four-advertiser capacity rejects the fifth with all-or-nothing allocation",async()=>{
 const ids=[];for(let i=0;i<5;i++){const company=await asUser(db,seller,()=>rpc(db,"sales_create_customer","Rotation advertiser "+i,"dlpc"),true);await db.query("insert into sales_organization_members(organization_id,user_id,can_sign_agreements) values($1,$2,true)",[company,customer]);const id=await quote(db,company,[line("P02","2030-04-01","2030-04-14")]);await asUser(db,seller,()=>rpc(db,"sales_publish_quote",id,1),true);const agreement=uid(2100+i);await db.query("insert into sales_inventory_agreements(agreement_id,quote_id,version,signed_by,signed_at) values($1,$2,1,$3,now())",[agreement,id,customer]);ids.push(agreement);}
 for(const agreement of ids.slice(0,4))await rpc(db,"sales_reserve_signed_quote",agreement);
 await assert.rejects(rpc(db,"sales_reserve_signed_quote",ids[4]),/Inventory conflict/);assert.equal((await db.query("select count(*) n from sales_inventory_units where product_code='P02' and state='held'")).rows[0].n,56);
 await assert.rejects(db.query("insert into sales_inventory_units select gen_random_uuid(),agreement_id,quote_id,version,line_id,organization_id,district_key,product_code,resource_key,run_on,slot,state,hold_until,payment_due_at,created_at from sales_inventory_units where agreement_id=$1 limit 1",[ids[0]]),/duplicate key/);
 });
 await t.test("null or malformed exceptions and policy fields are rejected",async()=>{
 const id=await quote(db,org,[line("P03")]);const data=await content(db,id);
 for(const terms of [{price_cents:null},{price_cents:4.5},{allow_short_lead:"true"},{industry_exclusivity:{districts:["dlpc"],products:["P03"]}}])await assert.rejects(asUser(db,seller,()=>rpc(db,"sales_request_quote_override",id,1,data.lines[0].line_id,JSON.stringify(terms),"Malformed terms")));
 const policy=(await db.query("select terms from sales_policy_versions order by version desc limit 1")).rows[0].terms;
 await assert.rejects(asUser(db,owner,()=>rpc(db,"sales_publish_policy_version",JSON.stringify({...policy,asset_cents:null}))),/cannot be null/);
 });
 await t.test("earlier approval is explicit and never silently changes payment",async()=>{
 const id=await quote(db,org,[line("P03","2030-06-03","2030-06-16")]);const data=await content(db,id);const payment=data.lines[0].deadlines[0].payment_due_at;
 const request=await asUser(db,seller,()=>rpc(db,"sales_request_quote_override",id,1,data.lines[0].line_id,JSON.stringify({approval_due_at:"2030-05-29T17:00:00-05:00"}),"Production records early"),true);
 await asUser(db,manager,()=>rpc(db,"sales_decide_quote_override",request,true,"Early approval agreed"),true);await quote(db,org,data.input_lines,id,1,[request]);assert.equal((await content(db,id)).lines[0].deadlines[0].payment_due_at,payment);
 });
 await t.test("industry exclusivity requires a reviewed scope and enforces its price floor",async()=>{
 const id=await quote(db,org,[line("P03","2030-07-01","2030-07-14")]);const data=await content(db,id);const lineId=data.lines[0].line_id;
 const terms={industry_exclusivity:{scope:"placement",industry:"Independent coffee shops",districts:["dlpc"],products:["P03"],start_date:"2030-07-01",end_date:"2030-07-14"},existing_contract_review:"No overlapping contracts in scope"};
 const low=await asUser(db,seller,()=>rpc(db,"sales_request_quote_override",id,1,lineId,JSON.stringify({...terms,price_cents:9999}),"Exclusivity trial"),true);
 await assert.rejects(asUser(db,manager,()=>rpc(db,"sales_decide_quote_override",low,true,"Review")),/starting floor/);
 await asUser(db,manager,()=>rpc(db,"sales_decide_quote_override",low,false,"Below minimum"),true);
 const request=await asUser(db,seller,()=>rpc(db,"sales_request_quote_override",id,1,lineId,JSON.stringify(terms),"Narrow industry buyout"),true);
 await asUser(db,manager,()=>rpc(db,"sales_decide_quote_override",request,true,"Reviewed scope"),true);await quote(db,org,data.input_lines,id,1,[request]);assert.equal((await content(db,id)).advertising_cents,10000);
 await asUser(db,seller,()=>rpc(db,"sales_publish_quote",id,2),true);const agreement=uid(2200);await db.query("insert into sales_inventory_agreements(agreement_id,quote_id,version,signed_by,signed_at) values($1,$2,2,$3,now())",[agreement,id,customer]);await rpc(db,"sales_reserve_signed_quote",agreement);
 const contract=(await db.query("select * from sales_industry_contracts where agreement_id=$1",[agreement])).rows[0];assert.deepEqual(contract.resource_keys,[data.lines[0].resource_key]);
 const other=await asUser(db,seller,()=>rpc(db,"sales_create_customer","Industry competitor","dlpc"),true);const competitor=await quote(db,other,[line("P03","2030-07-01","2030-07-14")]);const availability=await asUser(db,seller,()=>rpc(db,"sales_quote_availability",competitor,1));assert.equal(availability.available,false);assert.ok(availability.conflicts.some(c=>c.reason==="paid_industry_scope_requires_manager_clearance"));assert.ok(!JSON.stringify(availability).includes(contract.id));
 });
 await t.test("hold expiry is five business days and capped by payment; prior grants survive",async()=>{
 const units=(await db.query("select * from sales_inventory_units where agreement_id=$1",[uid(2200)])).rows;
 const expected=(await db.query("select least(sales_private.central_deadline(sales_private.business_shift((signed_at at time zone 'America/Chicago')::date,5)),(select min(payment_due_at) from sales_inventory_units where agreement_id=$1)) value from sales_inventory_agreements where agreement_id=$1",[uid(2200)])).rows[0].value;
 assert.equal(new Date(units[0].hold_until).getTime(),new Date(expected).getTime());
 const grants=(await db.query("select has_function_privilege('service_role','public.sales_reserve_signed_quote(uuid)','EXECUTE') service,has_function_privilege('authenticated','public.sales_reserve_signed_quote(uuid)','EXECUTE') customer,has_function_privilege('service_role','public.sales_record_invitation_email(uuid,text,text,text)','EXECUTE') transport")).rows[0];
 assert.equal(grants.service,true);assert.equal(grants.customer,false);assert.equal(grants.transport,true);
 });
 await t.test("internal allocation and draft quote data are inaccessible to customers/agents",async()=>{
 await asUser(db,outsider,async()=>{assert.equal((await db.query("select * from sales_quotes")).rows.length,0);assert.equal((await db.query("select * from sales_inventory_units")).rows.length,0);});
 await asUser(db,agent,async()=>{assert.equal((await db.query("select * from sales_products")).rows.length,0);assert.equal((await db.query("select * from sales_quotes")).rows.length,0);});
 await assert.rejects(asUser(db,seller,()=>db.query("insert into sales_inventory_agreements(agreement_id,quote_id,version,signed_by,signed_at) select $1,id,current_version,$2,now() from sales_quotes limit 1",[uid(9999),customer])),/permission denied/);
 });
 }finally{await db.close();}
});
