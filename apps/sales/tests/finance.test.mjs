import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createPaymentService} from '../lib/payments/contract.mjs';
import {PGlite} from '@electric-sql/pglite';
const uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=uid(1),seller=uid(2),manager=uid(3),customer=uid(4),outsider=uid(5),agent=uid(6),replacement=uid(7);
async function rpc(db,name,...args){return (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).rows[0].result;}
async function asUser(db,id,fn,commit=true,role='authenticated'){
 await db.exec('begin');try{await db.exec(`set local role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id||'']);const result=await fn();await db.exec(commit?'commit':'rollback');return result;}catch(e){await db.exec('rollback');throw e;}
}
test('signed agreements, provider-neutral collection, checks and allocation ledgers',async t=>{
 const db=new PGlite();let seq=100;const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Chicago'});
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;grant usage on schema auth to anon,authenticated;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant execute on function auth.uid() to anon,authenticated;
 create schema storage;grant usage on schema storage to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));alter table storage.objects enable row level security;grant select,insert on storage.objects to authenticated;`);
 for(const f of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
 for(const id of [owner,seller,manager,customer,outsider,agent,replacement])await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,id+'@example.invalid']);
 await db.exec('update sales_profiles set active=true');await db.query('insert into sales_owner(user_id) values($1)',[owner]);
 for(const [id,role] of [[seller,'salesperson'],[replacement,'salesperson'],[manager,'district_manager'],[agent,'production_agent']])await db.query("insert into sales_staff_scopes(user_id,role,district_key) values($1,$2,'dlpc')",[id,role]);
 await asUser(db,manager,()=>rpc(db,'sales_configure_tax','dlpc','Explicit no tax',0,false,false));
 async function draft({who=seller,assets=[],special=false,customLine=null}={}){
 const n=seq++;const org=await asUser(db,who,()=>rpc(db,'sales_create_customer','Finance test '+n,'dlpc'));
 await db.query('insert into sales_organization_members(organization_id,user_id,can_sign_agreements) values($1,$2,true)',[org,customer]);
 const start=new Date(Date.UTC(2031,0,n*20));const end=new Date(start);end.setUTCDate(end.getUTCDate()+13);
 const line=customLine||(special?{product_code:'P05',district_key:'dlpc',special_dates:['2030-03-05','2030-03-12','2030-03-19','2030-03-26'],assets}:{product_code:'P03',district_key:'dlpc',start_date:start.toISOString().slice(0,10),end_date:end.toISOString().slice(0,10),assets});
 const opportunity=(await db.query('select id from sales_opportunities where organization_id=$1 limit 1',[org])).rows[0].id;
 const quote=await asUser(db,who,()=>rpc(db,'sales_save_quote',org,JSON.stringify([line]),null,null,[],opportunity));await asUser(db,who,()=>rpc(db,'sales_publish_quote',quote,1));return {org,quote,opportunity,key:uid(n)};
 }
 async function sign(d){const id=await asUser(db,customer,()=>rpc(db,'sales_sign_quote',d.quote,1,d.key,'Authorized Customer',true));return {...d,id,invoice:(await db.query('select * from sales_invoices where agreement_id=$1',[id])).rows[0]};}
 const event=(sale,key='capture',kind='captured',cents=sale.invoice.total_cents,provider='test_processor',transaction=key,occurred=new Date().toISOString())=>rpc(db,'sales_record_provider_event',sale.invoice.id,provider,key,transaction,kind,cents,'USD',occurred);
 let basic,ownerSale;
 await t.test('printing/sharing do not reserve; only explicit authorized exact-version signing commits',async()=>{
 const d=await draft({special:true});assert.equal((await db.query('select count(*) n from sales_inventory_units')).rows[0].n,0);
 await assert.rejects(asUser(db,seller,()=>rpc(db,'sales_sign_quote',d.quote,1,d.key,'Seller',true)),/Customer signing permission/);
 await assert.rejects(asUser(db,customer,()=>rpc(db,'sales_sign_quote',d.quote,1,d.key,'Customer',false)),/explicit acceptance/);
 await assert.rejects(asUser(db,customer,()=>rpc(db,'sales_sign_quote',d.quote,2,d.key,'Customer',true)),/Quote changed/);
 basic=await sign(d);assert.equal(basic.invoice.total_cents,10000);assert.equal((await db.query("select stage from sales_opportunities where id=$1",[basic.opportunity])).rows[0].stage,"signed_awaiting_payment");assert.equal((await db.query('select count(*) n from sales_inventory_units where agreement_id=$1',[basic.id])).rows[0].n,4);
 assert.equal((await db.query('select earned_at from sales_allocations where agreement_id=$1',[basic.id])).rows[0].earned_at,null);
 assert.equal(await asUser(db,customer,()=>rpc(db,'sales_sign_quote',d.quote,1,uid(999),'Customer',true)),basic.id);
 assert.equal((await db.query('select count(*) n from sales_invoices')).rows[0].n,1);
 });
 await t.test('capture creates exactly one receipt and $30 allocation; retries must match',async()=>{
 const when=new Date().toISOString();const id=await event(basic,'capture-base','captured',10000,'test_processor','tx-base',when);
 assert.equal(await event(basic,'capture-base','captured',10000,'test_processor','tx-base',when),id);
 await assert.rejects(event(basic,'capture-base','captured',9999,'test_processor','tx-base',when),/Conflicting duplicate/);
 assert.equal((await db.query('select count(*) n from sales_receipts where invoice_id=$1',[basic.invoice.id])).rows[0].n,1);
 const a=(await db.query('select * from sales_allocations where agreement_id=$1',[basic.id])).rows[0];assert.equal(a.amount_cents,3000);assert.ok(a.earned_at);assert.equal((await db.query('select stage from sales_opportunities where id=$1',[basic.opportunity])).rows[0].stage,'won');
 assert.equal((await db.query('select inventory_status from sales_invoices where id=$1',[basic.invoice.id])).rows[0].inventory_status,'booked');
 });
 await t.test('production fees and tax never enter commission; processor fee/payout do not delay or reduce it',async()=>{
 await asUser(db,manager,()=>rpc(db,'sales_configure_tax','dlpc','Test 5 percent',500,true,true));
 const sale=await sign(await draft({assets:[{label:'Paid banner'}]}));assert.equal(sale.invoice.advertising_cents,5000);assert.equal(sale.invoice.asset_cents,1500);assert.equal(sale.invoice.tax_cents,325);assert.equal(sale.invoice.total_cents,6825);
 await event(sale,'with-assets');await event(sale,'fee','processor_fee',250);await event(sale,'payout','bank_payout',6575);
 assert.equal((await db.query('select amount_cents from sales_allocations where agreement_id=$1',[sale.id])).rows[0].amount_cents,1500);
 await asUser(db,manager,()=>rpc(db,'sales_configure_tax','dlpc','No tax',0,false,false));
 });
 await t.test('customers/sellers/production agents cannot forge payment facts or raw financial writes',async()=>{
 for(const id of [seller,customer,agent,outsider])await assert.rejects(asUser(db,id,()=>event(basic,'forged-'+id)),/permission denied/);
 await assert.rejects(asUser(db,seller,()=>db.query("update sales_invoices set collected_cents=total_cents")),/permission denied/);
 await assert.rejects(asUser(db,customer,()=>db.query("insert into sales_owner_movements select * from sales_owner_movements")),/permission denied/);
 });
 await t.test('currency mismatches fail; unexpected real money is retained for review and transaction retries deduplicate',async()=>{
 const sale=await sign(await draft());await event(sale,'bad-amount','captured',4999);assert.equal((await db.query('select payment_review_required from sales_invoices where id=$1',[sale.invoice.id])).rows[0].payment_review_required,true);assert.equal((await db.query('select earned_at from sales_allocations where agreement_id=$1',[sale.id])).rows[0].earned_at,null);
 await assert.rejects(rpc(db,'sales_record_provider_event',sale.invoice.id,'test_processor','bad-currency','bad-currency','captured',5000,'EUR',new Date().toISOString()),/currency/);
 const valid=await sign(await draft());await event(valid,'proper-capture');await event(valid,'second-capture');assert.equal((await db.query('select collected_cents from sales_invoices where id=$1',[valid.invoice.id])).rows[0].collected_cents,10000);assert.equal((await db.query('select count(*) n from sales_allocations where agreement_id=$1',[valid.id])).rows[0].n,1);await event(valid,'different-event-same-tx','captured',5000,'test_processor','proper-capture');assert.equal((await db.query('select count(*) n from sales_receipts where invoice_id=$1',[valid.invoice.id])).rows[0].n,2);
 assert.equal((await db.query('select count(*) n from sales_payment_events where invoice_id=$1',[sale.invoice.id])).rows[0].n,1);
 });
 await t.test('check receipt/deposit stay unpaid; live receipt extends hold only to payment due',async()=>{
 const sale=await sign(await draft());const check=uid(seq++);
 await asUser(db,seller,()=>rpc(db,'sales_receive_check',sale.invoice.id,check,'Check 101',today));
 const inv=(await db.query('select * from sales_invoices where id=$1',[sale.invoice.id])).rows[0];assert.equal(inv.collected_cents,0);
 const hold=(await db.query('select hold_until from sales_inventory_units where agreement_id=$1 limit 1',[sale.id])).rows[0].hold_until;assert.equal(new Date(hold).getTime(),new Date(inv.due_at).getTime());
 await assert.rejects(asUser(db,seller,()=>rpc(db,'sales_update_check',check,'clear',today)),/manager/);
 await assert.rejects(asUser(db,manager,()=>rpc(db,'sales_update_check',check,'clear',today)),/Deposit must precede/);
 await asUser(db,seller,()=>rpc(db,'sales_update_check',check,'deposit',today));assert.equal((await db.query('select collected_cents from sales_invoices where id=$1',[sale.invoice.id])).rows[0].collected_cents,0);
 await asUser(db,manager,()=>rpc(db,'sales_update_check',check,'clear',today));await asUser(db,manager,()=>rpc(db,'sales_update_check',check,'clear',today));
 assert.equal((await db.query('select count(*) n from sales_receipts where invoice_id=$1',[sale.invoice.id])).rows[0].n,1);
 });
 await t.test('expired inventory stays released on late payment, with receipt, allocation and conflict notice',async()=>{
 const sale=await sign(await draft());await db.query("update sales_inventory_units set hold_until=now()-interval '1 second' where agreement_id=$1",[sale.id]);
 const check=uid(seq++);await asUser(db,seller,()=>rpc(db,'sales_receive_check',sale.invoice.id,check,'Late check',today));
 assert.equal((await db.query('select state from sales_inventory_units where agreement_id=$1 limit 1',[sale.id])).rows[0].state,'released');
 await asUser(db,seller,()=>rpc(db,'sales_update_check',check,'deposit',today));await asUser(db,manager,()=>rpc(db,'sales_update_check',check,'clear',today));
 const inv=(await db.query('select * from sales_invoices where id=$1',[sale.invoice.id])).rows[0];assert.equal(inv.collected_cents,5000);assert.equal(inv.inventory_status,'payment_conflict');
 assert.equal((await db.query('select count(*) n from sales_inventory_units where agreement_id=$1 and state=\'booked\'',[sale.id])).rows[0].n,0);
 assert.ok((await db.query("select * from sales_notifications where event_key=$1",['paid:'+sale.id])).rows.length>0);
 });
 await t.test('refund is separate from collected revenue and never claws back original allocation',async()=>{
 await event(basic,'partial-refund','refunded',2500);const inv=(await db.query('select * from sales_invoices where id=$1',[basic.invoice.id])).rows[0];assert.equal(inv.collected_cents,10000);assert.equal(inv.refunded_cents,2500);
 assert.equal((await db.query('select amount_cents from sales_allocations where agreement_id=$1',[basic.id])).rows[0].amount_cents,3000);await assert.rejects(event(basic,'excess-refund','refunded',8000),/exceeds actual/);
 });
 await t.test('owner allocation supports partial withdrawal/retention without double use',async()=>{
 ownerSale=await sign(await draft({who:owner,assets:[{label:'Owner graphic'}]}));await event(ownerSale,'owner-capture');const a=(await db.query('select * from sales_allocations where agreement_id=$1',[ownerSale.id])).rows[0];assert.equal(a.beneficiary_kind,'owner');assert.equal(a.amount_cents,1500);
 const key=uid(seq++);await asUser(db,owner,()=>rpc(db,'sales_record_owner_movement',a.id,key,'withdrawn',500,today,'Bank withdrawal 1'));assert.equal(await asUser(db,owner,()=>rpc(db,'sales_record_owner_movement',a.id,key,'withdrawn',500,today,'Bank withdrawal 1')),key);
 await asUser(db,owner,()=>rpc(db,'sales_record_owner_movement',a.id,uid(seq++),'reinvested',1000,today,'Retained in business'));
 await assert.rejects(asUser(db,owner,()=>rpc(db,'sales_record_owner_movement',a.id,uid(seq++),'withdrawn',1,today,'Duplicate balance')),/already used/);
 await assert.rejects(asUser(db,seller,()=>rpc(db,'sales_record_owner_movement',a.id,uid(seq++),'withdrawn',1,today,'No')),/owner only/);
 });
 await t.test('customer transfer never changes signed-sale seller or allocation; future sales use new seller',async()=>{
 const sale=await sign(await draft());await asUser(db,manager,()=>rpc(db,'sales_transfer_salesperson',sale.org,replacement,'Documented customer service transfer'));await event(sale,'after-transfer');
 const a=(await db.query('select * from sales_allocations where agreement_id=$1',[sale.id])).rows[0];assert.equal(a.beneficiary_id,seller);
 await asUser(db,seller,async()=>assert.equal((await db.query('select * from sales_allocations where id=$1',[a.id])).rows.length,1));
 const newer=await sign(await draft({who:replacement}));assert.equal((await db.query('select seller_id from sales_agreements where id=$1',[newer.id])).rows[0].seller_id,replacement);
 });
 await t.test('takeover is discretionary 5 percent additional expense; original allocation stays intact',async()=>{
 const sale=await sign(await draft({customLine:{product_code:'P04',district_key:'dlpc',start_date:'2030-04-01',end_date:'2030-04-28',assets:[]}}));await event(sale,'takeover-capture');await asUser(db,manager,()=>rpc(db,'sales_transfer_salesperson',sale.org,replacement,'Documented customer service transfer'));
 await assert.rejects(asUser(db,replacement,()=>rpc(db,'sales_approve_takeover',sale.id,replacement,30000,'Half undelivered with documented dates')),/manager/);
 await asUser(db,manager,()=>rpc(db,'sales_approve_takeover',sale.id,replacement,30000,'Half undelivered; explicit manager assessment of remaining placement dates'));
 const rows=(await db.query('select * from sales_allocations where agreement_id=$1 order by kind',[sale.id])).rows;assert.equal(rows.find(a=>a.kind==='sale').amount_cents,18000);assert.equal(rows.find(a=>a.kind==='takeover').amount_cents,1500);
 });
 await t.test('employee payouts default inactive; owner allocation cannot enter payroll',async()=>{
 await assert.rejects(asUser(db,owner,()=>rpc(db,'sales_schedule_payroll',uid(seq++),today,[uid(900)])),/inactive/);
 await assert.rejects(asUser(db,owner,()=>rpc(db,'sales_configure_payroll',true,null,null,false,false,false)),/check constraint/);
 const anchor=(await db.query("select ((now() at time zone 'America/Chicago')::date+14)::text value")).rows[0].value;
 await asUser(db,owner,()=>rpc(db,'sales_configure_payroll',true,anchor,7,true,true,true));
 const a=(await db.query('select id from sales_allocations where agreement_id=$1',[ownerSale.id])).rows[0].id;
 await assert.rejects(asUser(db,owner,()=>rpc(db,'sales_schedule_payroll',uid(seq++),anchor,[a])),/Only collected employee/);
 const employee=(await db.query("select id from sales_allocations where beneficiary_kind='employee' and earned_at is not null limit 1")).rows[0].id;const key=uid(seq++);await asUser(db,owner,()=>rpc(db,'sales_schedule_payroll',key,anchor,[employee]));
 await assert.rejects(asUser(db,owner,()=>rpc(db,'sales_schedule_payroll',uid(seq++),anchor,[employee])),/duplicate key/);
 await asUser(db,owner,()=>rpc(db,'sales_configure_payroll',false,anchor,7,true,true,true));
 });
 await t.test('paper evidence uses a private immutable uploaded PDF; printing alone never signs',async()=>{
 const d=await draft();const path=d.org+'/'+seller+'/'+uid(seq++)+'.pdf';
 await assert.rejects(asUser(db,seller,()=>rpc(db,'sales_sign_quote',d.quote,1,d.key,'Paper Signer',true,'paper',today,path)),/Upload the signed PDF/);
 await asUser(db,seller,()=>db.query("insert into storage.objects(bucket_id,name) values('sales-agreements',$1)",[path]));
 const id=await asUser(db,seller,()=>rpc(db,'sales_sign_quote',d.quote,1,d.key,'Paper Signer',true,'paper',today,path));
 assert.ok(id);await assert.rejects(db.query("update sales_inventory_agreements set paper_signer_name='Changed' where agreement_id=$1",[id]),/immutable/);
 await asUser(db,customer,async()=>assert.equal((await db.query('select * from storage.objects where name=$1',[path])).rows.length,1));
 await asUser(db,outsider,async()=>assert.equal((await db.query('select * from storage.objects where name=$1',[path])).rows.length,0));
 });
 await t.test('fake providers drive real SQL through the shared contract for $100/$115 invoices and $30 allocations',async()=>{
 for(const [provider,assets,total] of [['test_one',[],10000],['test_two',[{label:'New Specials graphic'}],11500]]){
 const sale=await sign(await draft({special:true,assets}));assert.equal(sale.invoice.total_cents,total);
 const fact={invoiceId:sale.invoice.id,eventId:'accepted',transactionId:'tx-'+sale.id,kind:'captured',amountCents:total,currency:'USD',occurredAt:new Date().toISOString()};
 const adapter={id:provider,async createHostedCheckout(input){return {sessionId:input.idempotencyKey,url:'https://example.invalid/test'};},async verifyNotification(body,headers){if(headers.verified!=='test-only')throw new Error('Invalid signature');return JSON.parse(body);},async lookupPayment(){return [fact];}};
 const service=createPaymentService(adapter,{async eligibility(id){return asUser(db,customer,()=>rpc(db,'sales_payment_eligibility',id));},async record(e,name){return rpc(db,'sales_record_provider_event',e.invoiceId,name,e.eventId,e.transactionId,e.kind,e.amountCents,e.currency,e.occurredAt);}});
 await service.checkout(sale.invoice.id,'https://example.invalid/return');await assert.rejects(service.notification(JSON.stringify([fact]),{}),/Invalid signature/);
 // A verified notification updates facts even when the browser never returns.
 await service.notification(JSON.stringify([fact]),{verified:'test-only'});await service.reconcile(sale.invoice.id);await service.notification(JSON.stringify([fact]),{verified:'test-only'});
 assert.equal((await db.query('select count(*) n from sales_receipts where invoice_id=$1',[sale.invoice.id])).rows[0].n,1);
 assert.equal((await db.query('select amount_cents from sales_allocations where agreement_id=$1',[sale.id])).rows[0].amount_cents,3000);
 }
 });
 await t.test('a signing conflict rolls back evidence, invoice and allocation together',async()=>{
 const customLine={product_code:'P01',district_key:'dlpc',start_date:'2040-06-01',end_date:'2040-06-07',assets:[]};
 const one=await draft({customLine}),two=await draft({customLine});await sign(one);await assert.rejects(sign(two),/Inventory conflict/);
 for(const table of ['sales_inventory_agreements','sales_agreements','sales_invoices','sales_allocations']){const column=table==='sales_agreements'?'id':'agreement_id';assert.equal((await db.query(`select count(*) n from ${table} where ${column}=$1`,[two.key])).rows[0].n,0);}
 });
 await t.test('expired holds notify once and background expiry does not need an authenticated customer',async()=>{
 const sale=await sign(await draft());await db.query("update sales_inventory_units set hold_until=now()-interval '1 second' where agreement_id=$1",[sale.id]);
 await asUser(db,null,()=>rpc(db,'sales_expire_all_holds'),true,'service_role');await asUser(db,null,()=>rpc(db,'sales_expire_all_holds'),true,'service_role');
 const notice=(await db.query("select count(*) n from sales_notifications where event_key=$1 and recipient_id=$2",['expired:'+sale.id,customer])).rows[0].n;assert.equal(notice,1);
 await assert.rejects(asUser(db,customer,()=>rpc(db,'sales_expire_all_holds')),/permission denied/);
 });
 await t.test('allocation attribution is immutable and refund initiation requires management scope',async()=>{
 await assert.rejects(db.query('update sales_allocations set amount_cents=amount_cents+1 where agreement_id=$1',[basic.id]),/immutable/);
 await assert.rejects(asUser(db,customer,()=>rpc(db,'sales_refund_eligibility',basic.invoice.id,100)),/manager authority/);
 await assert.rejects(asUser(db,seller,()=>rpc(db,'sales_refund_eligibility',basic.invoice.id,100)),/manager authority/);
 await asUser(db,manager,()=>rpc(db,'sales_refund_eligibility',basic.invoice.id,100));
 });
 await t.test('a district manager cannot clear a cross-district invoice without authority over all of it',async()=>{
 await db.exec("insert into sales_districts(district_key,name) values('other','Other test district')");await asUser(db,owner,()=>rpc(db,'sales_configure_tax','other','No tax',0,false,false));
 const d=await draft();await db.query("insert into sales_organization_districts(organization_id,district_key) values($1,'other')",[d.org]);
 const inputs=(await db.query('select content from sales_quote_versions where quote_id=$1',[d.quote])).rows[0].content.input_lines;const lines=[inputs[0],{...inputs[0],line_id:undefined,district_key:'other'}];
 await asUser(db,seller,()=>rpc(db,'sales_save_quote',d.org,JSON.stringify(lines),d.quote,1));await asUser(db,seller,()=>rpc(db,'sales_publish_quote',d.quote,2));
 const id=await asUser(db,customer,()=>rpc(db,'sales_sign_quote',d.quote,2,d.key,'Authorized customer',true));const invoice=(await db.query('select * from sales_invoices where agreement_id=$1',[id])).rows[0];const check=uid(seq++);
 await asUser(db,seller,()=>rpc(db,'sales_receive_check',invoice.id,check,'Cross-district check',today));await asUser(db,seller,()=>rpc(db,'sales_update_check',check,'deposit',today));await assert.rejects(asUser(db,manager,()=>rpc(db,'sales_update_check',check,'clear',today)),/denied|manager/);
 await asUser(db,owner,()=>rpc(db,'sales_update_check',check,'clear',today));
 });
 await t.test('customer sees invoices/receipts but no internal fees, allocations, payroll or other organizations',async()=>{
 await asUser(db,customer,async()=>{assert.ok((await db.query('select * from sales_receipts')).rows.length);for(const table of ['sales_payment_events','sales_allocations','sales_owner_movements','sales_payroll_runs'])assert.equal((await db.query('select * from '+table)).rows.length,0);});
 for(const user of [agent,outsider])await asUser(db,user,async()=>{for(const table of ['sales_agreements','sales_invoices','sales_checks','sales_receipts','sales_allocations'])assert.equal((await db.query('select * from '+table)).rows.length,0);});
 assert.equal((await db.query('select mailing_instructions from sales_finance_settings')).rows[0].mailing_instructions,'');
 });
 }finally{await db.close();}
});
