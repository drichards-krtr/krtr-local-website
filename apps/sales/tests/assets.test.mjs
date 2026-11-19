import test from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const uid=n=>`50000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=uid(1),seller=uid(2),manager=uid(3),customer=uid(4),agent=uid(5),outsider=uid(6);let seq=100;
async function rpc(db,name,...args){return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;}
async function as(db,id,fn,commit=true,role='authenticated'){await db.exec('begin');try{await db.exec('set local role '+role);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id||'']);const r=await fn();await db.exec(commit?'commit':'rollback');return r;}catch(e){await db.exec('rollback');throw e;}}
test('asset versions, individual revision accounting, approvals and campaign readiness',async t=>{
 const db=new PGlite();try{
 const finance=await readFile(new URL('./finance.test.mjs',import.meta.url),'utf8');await db.exec(finance.match(/await db.exec\(`(create role[\s\S]*?)`\);/)[1]);
 for(const f of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
 for(const id of [owner,seller,manager,customer,agent,outsider])await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,id+'@example.invalid']);
 await db.exec('update sales_profiles set active=true');await db.query('insert into sales_owner(user_id) values($1)',[owner]);
 for(const [id,role] of [[seller,'salesperson'],[manager,'district_manager'],[agent,'production_agent']])await db.query("insert into sales_staff_scopes(user_id,role,district_key) values($1,$2,'dlpc')",[id,role]);
 await as(db,manager,()=>rpc(db,'sales_configure_tax','dlpc','Explicit no tax',0,false,false));
 const org=await as(db,seller,()=>rpc(db,'sales_create_customer','Asset customer','dlpc'));await db.query('insert into sales_organization_members(organization_id,user_id,can_approve_assets,can_sign_agreements) values($1,$2,true,true)',[org,customer]);
 const quote=await as(db,seller,()=>rpc(db,'sales_save_quote',org,JSON.stringify([{product_code:'P05',district_key:'dlpc',special_dates:['2030-03-05','2030-03-12','2030-03-19','2030-03-26'],assets:[{label:'Tuesday graphic'}]}])));
 const content=(await db.query('select content from sales_quote_versions where quote_id=$1',[quote])).rows[0].content;
 await as(db,seller,()=>rpc(db,'sales_publish_quote',quote,1));const agreement=await as(db,customer,()=>rpc(db,'sales_sign_quote',quote,1,uid(seq++),'Customer',true));
 const invoice=(await db.query("select * from sales_invoices where agreement_id=$1 and invoice_kind='agreement'",[agreement])).rows[0];
 const taxId=(await db.query('select id from sales_tax_versions order by created_at desc limit 1')).rows[0].id;
 const asset=content.lines[0].assets[0].id;const line=content.lines[0].line_id;
 const act=(name,...args)=>as(db,seller,()=>rpc(db,name,...args));
 async function media(target,purpose,width,height,alpha=false){const id=uid(seq++);await act('sales_begin_asset_upload',target,purpose,id);await rpc(db,'sales_register_asset_media',id,seller,'cloud-'+id,'1','png',width,height,alpha,'a'.repeat(64));return id;}
 let logo,art;
 await t.test('creation keeps quoted unique identity and producer access requires explicit district assignment',async()=>{
 await act('sales_create_asset',asset,org,'dlpc','Tuesday graphic','display','krtr');await act('sales_create_asset',asset,org,'dlpc','Tuesday graphic','display','krtr');
 await as(db,agent,async()=>assert.equal((await db.query('select * from sales_assets')).rows.length,0));await act('sales_assign_asset_producer',asset,agent);
 await as(db,agent,async()=>{assert.equal((await db.query('select * from sales_assets')).rows.length,1);assert.equal((await db.query('select * from sales_invoices')).rows.length,0);});
 await assert.rejects(as(db,outsider,()=>rpc(db,'sales_create_asset',uid(seq++),org,'dlpc','No','display','supplied')),/denied/);
 });
 await t.test('metadata registration is service-only, dimensions and real alpha are enforced',async()=>{
 const id=uid(seq++);await act('sales_begin_asset_upload',asset,'artwork',id);
 await assert.rejects(as(db,seller,()=>rpc(db,'sales_register_asset_media',id,seller,'cloud','1','png',1080,1160,false,'a'.repeat(64))),/permission denied/);
 await assert.rejects(rpc(db,'sales_register_asset_media',id,seller,'cloud','1','png',1920,1080,false,'a'.repeat(64)),/dimensions/);
 logo=await media(asset,'logo',500,500);art=await media(asset,'artwork',1080,1160);
 const logoAsset=uid(seq++);await act('sales_create_asset',logoAsset,org,'dlpc','Bug','logo','supplied');await assert.rejects(media(logoAsset,'artwork',500,500,false),/transparency/);await media(logoAsset,'artwork',500,500,true);
 });
 await t.test('intake, advertiser logo, and signed creation fee precede KRTR output',async()=>{
 await assert.rejects(act('sales_publish_asset_version',asset,0,art,JSON.stringify({spoken_copy:'Tuesday dinner special'}),'initial'),/intake/);
 await act('sales_save_asset_intake',asset,0,JSON.stringify({goal:'More Tuesday diners',offer:'Tuesday dinner offer',approver:'Customer',logo_media_id:logo,brand_notes:'Use advertiser colors',hours:'Tuesday',restrictions:'While supplies last'}));
 await act('sales_publish_asset_version',asset,0,art,JSON.stringify({spoken_copy:'Tuesday dinner special'}),'initial');
 assert.equal((await db.query('select current_version from sales_assets where id=$1',[asset])).rows[0].current_version,1);
 });
 await t.test('silence and staff approval are not advertiser approval; revisions need comments',async()=>{
 await assert.rejects(as(db,seller,()=>rpc(db,'sales_review_asset',asset,1,uid(seq++),'approved','',agreement)),/advertiser/);
 await assert.rejects(as(db,customer,()=>rpc(db,'sales_review_asset',asset,1,uid(seq++),'revision_requested','',agreement)),/comment/);
 await act('sales_bind_creative',agreement,line,'special_display',null,asset,1);
 const state=await as(db,customer,()=>rpc(db,'sales_campaign_readiness',agreement));assert.ok(state[0].blocks.some(b=>b.code==='asset_approval'));assert.equal(state[0].ready,false);
 });
 await t.test('explicit version approval plus real payment still requires broadcast handoff',async()=>{
 await as(db,customer,()=>rpc(db,'sales_review_asset',asset,1,uid(seq++),'approved','',agreement));
 await rpc(db,'sales_record_provider_event',invoice.id,'asset_test','capture','capture','captured',11500,'USD',new Date().toISOString());
 const state=await as(db,seller,()=>rpc(db,'sales_campaign_readiness',agreement));assert.ok(!state[0].blocks.some(b=>b.code==='payment'));assert.ok(!state[0].blocks.some(b=>b.code==='asset_approval'));assert.ok(state[0].blocks.some(b=>b.code==='nrcs_handoff'));
 });
 let first,second;
 await t.test('first revision belongs to this asset and is included; corrections do not consume another round',async()=>{
 await as(db,customer,()=>rpc(db,'sales_review_asset',asset,1,uid(seq++),'revision_requested','Please change the offer',agreement));first=uid(seq++);await act('sales_propose_asset_work',asset,agreement,first,'revision','Customer requested offer update');
 assert.equal((await db.query('select amount_cents from sales_asset_work where id=$1',[first])).rows[0].amount_cents,0);
 await as(db,agent,async()=>{assert.equal((await db.query('select * from sales_asset_work')).rows.length,0);assert.equal((await db.query('select * from public.sales_production_work($1)',[asset])).rows[0].id,first);});
 await as(db,agent,()=>rpc(db,'sales_publish_asset_version',asset,1,art,JSON.stringify({spoken_copy:'Revised Tuesday offer'}),'revision',first));
 const correction=uid(seq++);await act('sales_propose_asset_work',asset,agreement,correction,'correction','KRTR typo correction');await act('sales_publish_asset_version',asset,2,art,JSON.stringify({spoken_copy:'Corrected Tuesday offer'}),'correction',correction);
 second=uid(seq++);await act('sales_propose_asset_work',asset,agreement,second,'revision','Another customer round');assert.equal((await db.query('select amount_cents from sales_asset_work where id=$1',[second])).rows[0].amount_cents,500);
 });
 await t.test('new version invalidates former approval and pinned bindings; counters cannot reset',async()=>{
 const state=await as(db,seller,()=>rpc(db,'sales_campaign_readiness',agreement));assert.ok(state[0].blocks.some(b=>b.code==='asset_current'));assert.ok(state[0].blocks.some(b=>b.code==='asset_approval'));
 await assert.rejects(act('sales_publish_asset_version',asset,3,art,'{}','initial'),/cannot restart|authorization|work order/);
 await assert.rejects(as(db,customer,()=>rpc(db,'sales_review_asset',asset,1,uid(seq++),'approved','',agreement)),/current exact/);
 });
 await t.test('additional paid work requires customer signing authority before work and bills separately without commission',async()=>{
 await assert.rejects(act('sales_publish_asset_version',asset,3,art,'{}','revision',second),/before work begins/);
 await assert.rejects(as(db,seller,()=>rpc(db,'sales_decide_asset_work',second,true,'2030-03-01T17:00:00-06:00',taxId)),/Customer/);
 await as(db,customer,()=>rpc(db,'sales_decide_asset_work',second,true,'2030-03-01T17:00:00-06:00',taxId));
 await act('sales_publish_asset_version',asset,3,art,JSON.stringify({spoken_copy:'Third customer version'}),'revision',second);
 const workInvoice=(await db.query('select * from sales_invoices where asset_work_id=$1',[second])).rows[0];assert.equal(workInvoice.total_cents,500);assert.equal(workInvoice.advertising_cents,0);
 await rpc(db,'sales_record_provider_event',workInvoice.id,'asset_test','work-capture','work-capture','captured',500,'USD',new Date().toISOString());
 assert.equal((await db.query('select count(*) n from sales_allocations where agreement_id=$1',[agreement])).rows[0].n,1);assert.equal((await db.query('select amount_cents from sales_allocations where agreement_id=$1',[agreement])).rows[0].amount_cents,3000);
 assert.equal((await db.query('select total_cents from sales_invoices where id=$1',[invoice.id])).rows[0].total_cents,11500);
 });
 await t.test('another unique asset retains its own included revision; unchanged reuse adds no invoice',async()=>{
 const id=uid(seq++);await act('sales_create_asset',id,org,'dlpc','Friday graphic','display','krtr');const creation=uid(seq++);await act('sales_propose_asset_work',id,agreement,creation,'creation','New distinct Friday artwork');await as(db,customer,()=>rpc(db,'sales_decide_asset_work',creation,true,'2030-03-01T17:00:00-06:00',taxId));
 await act('sales_save_asset_intake',id,0,JSON.stringify({goal:'Friday diners',approver:'Customer',logo_media_id:logo}));await act('sales_publish_asset_version',id,0,art,JSON.stringify({spoken_copy:'Friday special'}),'initial',creation);
 const round=uid(seq++);await act('sales_propose_asset_work',id,agreement,round,'revision','First Friday revision');assert.equal((await db.query('select amount_cents from sales_asset_work where id=$1',[round])).rows[0].amount_cents,0);
 await as(db,customer,()=>rpc(db,'sales_review_asset',asset,4,uid(seq++),'approved','Standing accurate unchanged offer',null,true,'2030-03-01','2030-03-31'));
 const before=(await db.query('select count(*) n from sales_invoices')).rows[0].n;await act('sales_bind_creative',agreement,line,'special_display',null,asset,4);await act('sales_bind_creative',agreement,line,'special_display','2030-03-12',asset,4);assert.equal((await db.query('select count(*) n from sales_invoices')).rows[0].n,before);
 });
 await t.test('earlier signed approval deadlines wait for customer acceptance and do not move payment',async()=>{
 const request=uid(seq++);await as(db,manager,()=>rpc(db,'sales_propose_approval_deadline',agreement,line,'2030-03-05',request,'2030-02-28T17:00:00-06:00','Prerecorded episode'));
 const before=await as(db,customer,()=>rpc(db,'sales_campaign_readiness',agreement));assert.notEqual(new Date(before[0].approval_due_at).toISOString(),'2030-02-28T23:00:00.000Z');
 await assert.rejects(as(db,seller,()=>rpc(db,'sales_decide_approval_deadline',request,true)),/customer/);
 await as(db,customer,()=>rpc(db,'sales_decide_approval_deadline',request,true));const after=await as(db,customer,()=>rpc(db,'sales_campaign_readiness',agreement));assert.equal(new Date(after[0].approval_due_at).toISOString(),'2030-02-28T23:00:00.000Z');
 assert.equal(new Date((await db.query('select due_at from sales_invoices where id=$1',[invoice.id])).rows[0].due_at).getTime(),new Date(invoice.due_at).getTime());
 });
 await t.test('scoped exceptions remain visible without fabricating handoff, approval or payment facts',async()=>{
 const id=uid(seq++);await assert.rejects(as(db,seller,()=>rpc(db,'sales_set_readiness_exception',id,agreement,line,'2030-03-05','nrcs_handoff','Documented controlled rehearsal',true,'2030-03-06T00:00:00-06:00')),/manager/);
 await as(db,manager,()=>rpc(db,'sales_set_readiness_exception',id,agreement,line,'2030-03-05','nrcs_handoff','Documented controlled rehearsal',true,'2030-03-06T00:00:00-06:00'));
 let state=await as(db,customer,()=>rpc(db,'sales_campaign_readiness',agreement));assert.ok(state[0].blocks.find(b=>b.code==='nrcs_handoff').exception_id);assert.ok(state[1].blocks.find(b=>b.code==='nrcs_handoff').exception_id===null);
 await as(db,manager,()=>rpc(db,'sales_revoke_readiness_exception',id,'Rehearsal finished'));state=await as(db,customer,()=>rpc(db,'sales_campaign_readiness',agreement));assert.equal(state[0].blocks.find(b=>b.code==='nrcs_handoff').exception_id,null);
 });
 await t.test('removal loses access, private outbox is not exposed, milestones are logically deduplicated',async()=>{
 await as(db,outsider,async()=>{for(const table of ['sales_assets','sales_asset_versions','sales_asset_media','sales_asset_reviews'])assert.equal((await db.query('select * from '+table)).rows.length,0);});
 await assert.rejects(as(db,customer,()=>rpc(db,'sales_claim_asset_notices')),/permission denied/);
 const notices=await rpc(db,'sales_claim_asset_notices');assert.ok(notices.length>0);assert.equal(new Set(notices.map(n=>n.id)).size,notices.length);assert.ok(notices.every(n=>n.email.endsWith('@example.invalid')));
 await db.query('delete from sales_organization_members where organization_id=$1 and user_id=$2',[org,customer]);await as(db,customer,async()=>assert.equal((await db.query('select * from sales_assets')).rows.length,0));
 });
 }finally{await db.close();}
});
