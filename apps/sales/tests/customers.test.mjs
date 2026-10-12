import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { centralToday, workBucket, orderWork } from "../lib/workflow.mjs";

const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const users = { owner:uid(1), seller:uid(2), newSeller:uid(3), manager:uid(4), regional:uid(5), customer:uid(6), secondCustomer:uid(7), outsider:uid(8), agent:uid(9), disabledStaff:uid(10) };
const regionA=uid(101), regionB=uid(102);
async function asUser(db,key,callback,commit=false,role="authenticated") {
 await db.exec("begin");
 try { await db.exec(`set local role ${role}`); await db.query("select set_config('request.jwt.claim.sub',$1,true)",[users[key] || ""]);const result=await callback();await db.exec(commit?"commit":"rollback");return result; }
 catch(e) {await db.exec("rollback");throw e;}
}
async function rpc(db,name,...args){const result=await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(",")}) result`,args);return result.rows[0].result;}

test("follow-up prioritization uses Central dates and retains unfinished work",()=>{
 assert.equal(centralToday(new Date("2026-10-13T02:00:00Z")),"2026-10-12");
 assert.equal(centralToday(new Date("2026-03-08T07:30:00Z")),"2026-03-08");
 const base={stage:"prospect",next_action:"Call",next_action_on:"2026-10-12"};
 assert.equal(workBucket(base,"2026-10-12"),"today");
 const items=[{...base,id:"1",next_action_on:"2026-10-20"},{...base,id:"2",next_action_on:null},{...base,id:"3",next_action_on:"2026-10-10"},{...base,id:"4",stage:"not_now"},{...base,id:"5",stage:"proposal_sent"},{...base,id:"6",stage:"lost"}];
 assert.deepEqual(orderWork(items,"2026-10-12").map(x=>x.id),["3","4","5","2","1","6"]);
});

test("customers, invitations and pipeline execute with PostgreSQL permissions",async t=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;grant usage on schema auth to anon,authenticated;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant execute on function auth.uid() to anon,authenticated;`);
 for(const migration of ["20261012000100_sales_foundation.sql","20261012000200_customers_pipeline.sql"]) await db.exec(await readFile(new URL("../supabase/migrations/"+migration,import.meta.url),"utf8"));
 for(const [name,id] of Object.entries(users)) await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",[id,name+"@example.invalid"]);
 await db.exec("update sales_profiles set active=true");await db.query("update sales_profiles set active=false where id=$1",[users.disabledStaff]);
 await db.query("insert into sales_owner(user_id) values($1)",[users.owner]);
 await db.query("insert into sales_regions(id,name) values($1,'Test A'),($2,'Test B')",[regionA,regionB]);
 await db.query("update sales_districts set region_id=$1 where district_key='dlpc'",[regionA]);
 await db.query("insert into sales_districts(district_key,name,region_id) values('same-region','Same region',$1),('other-region','Other region',$2)",[regionA,regionB]);
 for(const [key,role,district] of [["seller","salesperson","dlpc"],["newSeller","salesperson","dlpc"],["manager","district_manager","dlpc"],["agent","production_agent","dlpc"],["disabledStaff","salesperson","dlpc"]]) await db.query("insert into sales_staff_scopes(user_id,role,district_key) values($1,$2,$3)",[users[key],role,district]);
 await db.query("insert into sales_staff_scopes(user_id,role,region_id) values($1,'regional_manager',$2)",[users.regional,regionA]);
 const org=await asUser(db,"seller",()=>rpc(db,"sales_create_customer","Test customer","dlpc","Contact","contact@example.invalid","",""),true);
 const competitor=await asUser(db,"owner",()=>rpc(db,"sales_create_customer","Competitor","other-region"),true);
 const opportunity=(await db.query("select id from sales_opportunities where organization_id=$1",[org])).rows[0].id;
 const hash="a".repeat(64), hash2="b".repeat(64);
 await t.test("salesperson creates only within broad assigned districts",async()=>{
 await assert.rejects(asUser(db,"seller",()=>rpc(db,"sales_create_customer","No authority","other-region")),/assigned sales district/);
 await assert.rejects(asUser(db,"agent",()=>rpc(db,"sales_create_customer","No authority","dlpc")),/assigned sales district/);
 assert.equal((await db.query("select count(*) n from sales_ownership_history where organization_id=$1",[org])).rows[0].n,1);
 });
 await t.test("expansion grants only this customer's access and notifies managers once",async()=>{
 await asUser(db,"seller",()=>rpc(db,"sales_add_customer_district",org,"same-region"),true);
 await asUser(db,"seller",()=>rpc(db,"sales_add_customer_district",org,"same-region"),true);
 await asUser(db,"seller",async()=>{
 assert.equal((await db.query("select * from sales_organizations where id=$1",[competitor])).rows.length,0);
 assert.equal((await db.query("select * from sales_staff_scopes where district_key='same-region'")).rows.length,0);
 assert.equal((await db.query("select * from sales_districts where district_key='same-region'")).rows.length,1);
 });
 assert.equal((await db.query("select * from sales_notifications where event_key=$1",['expansion:'+org+':same-region'])).rows.length,1);
 await assert.rejects(asUser(db,"seller",()=>rpc(db,"sales_create_customer","Cannot expand general access","same-region")),/assigned sales district/);
 });
 await t.test("manager transfer boundary is district or whole assigned region",async()=>{
 await assert.rejects(asUser(db,"manager",()=>rpc(db,"sales_transfer_salesperson",org,users.newSeller,"Requested transfer")),/whole-company manager scope/);
 await asUser(db,"regional",()=>rpc(db,"sales_transfer_salesperson",org,users.newSeller,"Within region"));
 await asUser(db,"seller",()=>rpc(db,"sales_add_customer_district",org,"other-region"),true);
 await assert.rejects(asUser(db,"regional",()=>rpc(db,"sales_transfer_salesperson",org,users.newSeller,"Cross region")),/whole-company manager scope/);
 });
 await t.test("salesperson transfer preserves attribution and revokes old specific access",async()=>{
 await asUser(db,"owner",async()=>{
 await rpc(db,"sales_transfer_salesperson",org,users.newSeller,"Owner-authorized transfer");
 const updated=(await db.query("select * from sales_opportunities where id=$1",[opportunity])).rows[0];
 assert.equal(updated.original_salesperson_id,users.seller);assert.equal(updated.owner_id,users.newSeller);
 assert.equal((await db.query("select * from sales_customer_district_access where organization_id=$1 and user_id=$2 and revoked_at is null",[org,users.seller])).rows.length,0);
 assert.equal((await db.query("select * from sales_ownership_history where organization_id=$1",[org])).rows.length,2);
 });
 });
 await t.test("pipeline enforces follow-ups, reasons, optimistic versions and financial stages",async()=>{
 const args=[opportunity,1,"not_now","","","Follow up",null,""];
 await assert.rejects(asUser(db,"seller",()=>rpc(db,"sales_update_opportunity",...args)),/check constraint/);
 args[2]="lost";await assert.rejects(asUser(db,"seller",()=>rpc(db,"sales_update_opportunity",...args)),/check constraint/);
 args[2]="won";await assert.rejects(asUser(db,"seller",()=>rpc(db,"sales_update_opportunity",...args)),/verified agreement\/payment/);
 args[2]="needs_identified";await assert.rejects(asUser(db,"seller",()=>rpc(db,"sales_update_opportunity",...args)),/check constraint/);
 await asUser(db,"seller",async()=>{
 await rpc(db,"sales_update_opportunity",opportunity,1,"contacted","Goal customer stated","Daily Specials","Call Tuesday","2026-10-20","");
 await assert.rejects(rpc(db,"sales_update_opportunity",opportunity,1,"contacted","","","",null,""),/changed/);
 });
 });
 await t.test("contact logging is immutable and private to authorized sales staff",async()=>{
 await asUser(db,"seller",()=>rpc(db,"sales_log_contact",opportunity,"phone","Customer asked about Tuesdays."),true);
 await asUser(db,"customer",async()=>{assert.equal((await db.query("select * from sales_contact_history")).rows.length,0);assert.equal((await db.query("select * from sales_opportunities")).rows.length,0);});
 await assert.rejects(asUser(db,"seller",()=>db.query("delete from sales_contact_history")),/permission denied/);
 });
 await t.test("invitation binds a verified email, independent permissions and no staff grants",async()=>{
 await asUser(db,"seller",()=>rpc(db,"sales_invite_customer",org,"customer@example.invalid",hash,true,true,false,true,"Initial onboarding"),true);
 await assert.rejects(asUser(db,"outsider",()=>rpc(db,"sales_accept_invitation",hash)),/verified invited email/);
 await asUser(db,"customer",()=>rpc(db,"sales_accept_invitation",hash),true);
 await asUser(db,"customer",()=>rpc(db,"sales_accept_invitation",hash));
 await asUser(db,"customer",()=>rpc(db,"sales_update_display_name","Customer Approver"),true);
 assert.equal((await db.query("select display_name from sales_profiles where id=$1",[users.customer])).rows[0].display_name,"Customer Approver");
 const member=(await db.query("select * from sales_organization_members where organization_id=$1 and user_id=$2",[org,users.customer])).rows[0];
 assert.equal(member.is_account_owner,true);assert.equal(member.can_approve_assets,true);assert.equal(member.can_sign_agreements,false);
 assert.equal((await db.query("select * from sales_staff_scopes where user_id=$1",[users.customer])).rows.length,0);
 await asUser(db,"customer",async()=>{assert.equal((await db.query("select * from sales_customer_details")).rows.length,0);assert.equal((await db.query("select * from sales_organizations")).rows.length,1);});
 });
 await t.test("customer owner invites members but cannot self-promote to staff",async()=>{
 await asUser(db,"customer",()=>rpc(db,"sales_invite_customer",org,"secondCustomer@example.invalid",hash2,true,false,true,false,""),true);
 await asUser(db,"secondCustomer",()=>rpc(db,"sales_accept_invitation",hash2),true);
 await assert.rejects(asUser(db,"secondCustomer",()=>rpc(db,"sales_set_member_permissions",org,users.secondCustomer,true,true,true)),/administration denied/);
 await assert.rejects(asUser(db,"customer",()=>rpc(db,"sales_create_customer","Unauthorized","dlpc")),/assigned sales district/);
 });
 await t.test("owner transfer retains current owner until the new owner accepts",async()=>{
 const transfer=await asUser(db,"customer",()=>rpc(db,"sales_request_account_transfer",org,users.secondCustomer,"Customer requested new account owner"),true);
 assert.equal((await db.query("select user_id from sales_organization_members where organization_id=$1 and is_account_owner",[org])).rows[0].user_id,users.customer);
 await assert.rejects(asUser(db,"customer",()=>rpc(db,"sales_decide_account_transfer",transfer,true)),/Only the new owner/);
 await asUser(db,"secondCustomer",()=>rpc(db,"sales_decide_account_transfer",transfer,true),true);
 await asUser(db,"secondCustomer",()=>rpc(db,"sales_decide_account_transfer",transfer,true));
 assert.equal((await db.query("select user_id from sales_organization_members where organization_id=$1 and is_account_owner",[org])).rows[0].user_id,users.secondCustomer);
 });
 await t.test("membership removal immediately removes organization access",async()=>{
 await asUser(db,"secondCustomer",()=>rpc(db,"sales_set_member_permissions",org,users.customer,false,false,false,true),true);
 await asUser(db,"customer",async()=>{assert.equal((await db.query("select * from sales_organizations where id=$1",[org])).rows.length,0);});
 await assert.rejects(asUser(db,"secondCustomer",()=>rpc(db,"sales_set_member_permissions",org,users.secondCustomer,false,false,false,true)),/Transfer account ownership/);
 });
 await t.test("disabled staff cannot regain staff privileges through a customer invite",async()=>{
 const token="c".repeat(64);
 await asUser(db,"owner",()=>rpc(db,"sales_invite_customer",org,"disabledStaff@example.invalid",token,true,false,false,false,"Test recovery"),true);
 await assert.rejects(asUser(db,"disabledStaff",()=>rpc(db,"sales_accept_invitation",token)),/Staff account deactivated/);
 });
 await t.test("revoked and expired tokens fail; unauthenticated writes are denied",async()=>{
 const token="d".repeat(64);
 const invite=await asUser(db,"owner",()=>rpc(db,"sales_invite_customer",org,"outsider@example.invalid",token,true,false,false,false,"Test recovery"),true);
 await asUser(db,"owner",()=>rpc(db,"sales_revoke_invitation",invite),true);
 await assert.rejects(asUser(db,"outsider",()=>rpc(db,"sales_accept_invitation",token)),/invalid or expired/);
 await assert.rejects(asUser(db,"outsider",()=>rpc(db,"sales_invite_customer",org,"outsider@example.invalid","e".repeat(64),true,false,false),false,"anon"),/permission denied/);
 await db.query("update sales_customer_invitations set revoked_at=null,expires_at=now()-interval '1 hour' where id=$1",[invite]);
 await assert.rejects(asUser(db,"outsider",()=>rpc(db,"sales_accept_invitation",token)),/invalid or expired/);
 });
 await t.test("broader district access needs scoped approval and never self-approval",async()=>{
 const request=await asUser(db,"seller",()=>rpc(db,"sales_request_district_access","same-region","Develop new customer relationships"),true);
 await assert.rejects(asUser(db,"seller",()=>rpc(db,"sales_decide_district_access",request,true,"Self approval")),/Scoped manager/);
 await asUser(db,"regional",()=>rpc(db,"sales_decide_district_access",request,true,"Approved regional access"),true);
 await asUser(db,"seller",()=>rpc(db,"sales_create_customer","New authorized prospect","same-region"));
 });
 await t.test("dual-role customer membership never exposes KRTR internal notes",async()=>{
 const company=(await db.query("select id from sales_organizations where id=$1",[competitor])).rows[0].id;
 await db.query("insert into sales_organization_members(organization_id,user_id) values($1,$2)",[company,users.seller]);
 await asUser(db,"seller",async()=>{assert.equal((await db.query("select * from sales_organizations where id=$1",[company])).rows.length,1);assert.equal((await db.query("select * from sales_customer_details where organization_id=$1",[company])).rows.length,0);});
 });
 await t.test("stale inviter authority cannot grant membership after regional reassignment",async()=>{
 const regionalOrg=await asUser(db,"seller",()=>rpc(db,"sales_create_customer","Regional recovery test","dlpc"),true);
 const token="f".repeat(64);
 await asUser(db,"regional",()=>rpc(db,"sales_invite_customer",regionalOrg,"outsider@example.invalid",token,true,false,false,false,"Recovery"),true);
 await db.query("update sales_districts set region_id=$1 where district_key='dlpc'",[regionB]);
 assert.equal((await db.query("select * from sales_inspect_invitation($1)",[token])).rows.length,0);
 await assert.rejects(asUser(db,"outsider",()=>rpc(db,"sales_accept_invitation",token)),/authorizer no longer/);
 await db.query("update sales_districts set region_id=$1 where district_key='dlpc'",[regionA]);
 });
 await t.test("primary district changes require owner authority and remain unique",async()=>{
 const scope=(await db.query("select id from sales_staff_scopes where user_id=$1 and district_key='dlpc'",[users.seller])).rows[0].id;
 await assert.rejects(asUser(db,"seller",()=>rpc(db,"sales_set_primary_scope",scope)),/Owner only/);
 await asUser(db,"owner",()=>rpc(db,"sales_set_primary_scope",scope),true);
 assert.equal((await db.query("select * from sales_staff_scopes where user_id=$1 and is_primary",[users.seller])).rows.length,1);
 });
 await t.test("invitation email outcome cannot be forged by an authenticated customer",async()=>{
 const invite=(await db.query("select id from sales_customer_invitations limit 1")).rows[0].id;
 await assert.rejects(asUser(db,"secondCustomer",()=>rpc(db,"sales_record_invitation_email",invite,"sent","forged",null)),/permission denied/);
 });
 await t.test("known launch prospects seed once and do not invent the Dysart restaurant",async()=>{
 await asUser(db,"owner",()=>rpc(db,"sales_seed_launch_prospects"),true);await asUser(db,"owner",()=>rpc(db,"sales_seed_launch_prospects"),true);
 assert.equal((await db.query("select * from sales_organizations where seed_key is not null")).rows.length,3);
 await assert.rejects(asUser(db,"seller",()=>rpc(db,"sales_seed_launch_prospects")),/Owner only/);
 });
 }finally{await db.close();}
});
