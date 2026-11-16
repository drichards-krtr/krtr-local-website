const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop:true } }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename:file})(name=>name in mocks ? mocks[name] : require(name),module,module.exports);
  return module.exports;
}
const routing = load('lib/publicCacheRouting.ts');
const districts = load('lib/districts.ts');
const params = value => new URLSearchParams(value);
for (const path of ['/cms','/cms/stories','/api/live','/calendar/submit','/garage-sales/submit','/nominations','/nominations/vote/test','/submit-story','/feed.xml','/_next/a.js']) assert.equal(routing.publicCacheDestination(path,params('')),null,path);
assert.equal(routing.publicCacheDestination('/',params('debug=1')),null);
assert.deepEqual(routing.publicCacheDestination('/',params('utm_source=facebook')),{view:'home',parts:[]});
assert.deepEqual(routing.publicCacheDestination('/tags/sports',params('')),{view:'tag',parts:['sports']});
const a = routing.publicCacheDestination('/calendar',params('towns=Dysart&towns=La+Porte+City&view=calendar&include_school_sports=0&include_school_sports=1'));
assert.deepEqual(routing.decodePublicQuery(a.parts[0]),{include_school_sports:['0','1'],towns:['Dysart','La Porte City'],view:'calendar'});
assert.deepEqual(routing.publicCacheDestination('/calendar',params('utm_source=f&view=calendar&towns=Dysart')),routing.publicCacheDestination('/calendar',params('towns=Dysart&view=calendar')));
assert.notDeepEqual(routing.publicCacheDestination('/garage-sales',params('date=2026-11-16')),routing.publicCacheDestination('/garage-sales',params('date=2026-11-17')));
assert.equal(routing.publicCacheDestination('/calendar',params('towns='+ 'x'.repeat(2100))),null);
assert.throws(()=>routing.decodePublicQuery('@@'));

let expired=[], paths=[], options=[];
const cache = load('lib/publicCache.ts',{
 'next/cache':{revalidateTag:(tag,profile)=>{assert.deepEqual(profile,{expire:0});expired.push(tag)},revalidatePath:(...args)=>paths.push(args),unstable_cache:(fn,key,config)=>{options.push(config);return fn}},
 '@/lib/districts':districts,
});
cache.invalidatePublicScope('vs');
assert.deepEqual(expired,['public-pages:vs','public-chrome:vs']);
expired=[]; cache.invalidatePublicScope('dlpc');
assert.deepEqual(expired,['public-pages:dlpc','public-chrome:dlpc','public-pages:global','public-chrome:global']);
expired=[]; cache.revalidatePath('/calendar');
assert.ok(expired.includes('public-pages:bc'));assert.deepEqual(paths,[['/calendar',undefined]]);

class ResponseMock { constructor(body,init){this.body=body;this.status=init?.status||200} static rewrite(url){return {rewrite:url}} static next(){return {next:true}} static redirect(url){return {redirect:url,cookies:{delete(){}}}} }
const proxy = load('proxy.ts',{'next/server':{NextResponse:ResponseMock},'@/lib/districts':districts,'@/lib/publicCacheRouting':routing,'@/lib/cmsSession':{CMS_SESSION_COOKIE:'cms',isCmsSessionExpired:()=>false},'@/lib/editorialFeatureFlag':{legacyEditorialEnabled:()=>true,isLegacyEditorialPath:()=>false}}).proxy;
function request(url,method='GET',headers={}) { const parsed=new URL(url); parsed.clone=()=>new URL(parsed);return {nextUrl:parsed,url,method,headers:new Headers({host:parsed.host,...headers}),cookies:{get(){}}}; }
const scoped=proxy(request('https://vs.krtrlocal.tv/calendar?view=calendar','GET',{'x-krtr-district':'dlpc','x-forwarded-host':'dlpc.krtrlocal.tv'}));
assert.match(scoped.rewrite.pathname,/^\/public-cache\/vs\/calendar\//);assert.equal(scoped.rewrite.search,'');
assert.equal(proxy(request('https://dlpc.krtrlocal.tv/calendar','POST')).next,true);
assert.equal(proxy(request('https://dlpc.krtrlocal.tv/public-cache/vs/home')).status,404);
assert.equal(proxy(request('https://dlpc.krtrlocal.tv/cms')).redirect.pathname,'/cms/login');
assert.match(proxy(request('https://dlpc.krtrlocal.tv/stories/example')).rewrite.pathname,/^\/article-cache\/dlpc\//);

(async()=>{
 await cache.dependOnPublicScope('bc',true); await cache.dependOnPublicScope('bc',false);
 assert.equal(options[0].revalidate,60);assert.equal(options[1].revalidate,false);
 let hidden=false,fail=false,invalidated=[];
 const event={id:'f9100000-0000-4000-8000-000000000001',nrcs_source_id:'f9100000-0000-4000-8000-000000000002',district_key:'bc',status:'published'};
 const api=load('app/api/nrcs/events/route.ts',{
  'next/server':{NextResponse:{json:Response.json}},'@/lib/nrcsPublication':{authorizeNrcsService:()=>true,sanitizePublicationHtml:x=>x},
  '@/lib/districts':districts,'@/lib/publicCache':{invalidatePublicScope:s=>invalidated.push(s)},
  '@/lib/supabase/admin':{createServiceClient:()=>({rpc:async(name)=>({data:{...event,status:hidden?'archived':'published'},error:fail?{message:'Database failed'}:null})})},
 });
 const payload={id:event.nrcs_source_id,district_key:'bc',status:'published',title:'Test',start_at:'2026-11-16T12:00:00Z',body_html:null};
 const post=()=>api.POST(new Request('https://example.invalid/api/nrcs/events',{method:'POST',body:JSON.stringify(payload)}));
 assert.equal((await post()).status,200);assert.deepEqual(invalidated,['bc']);
 fail=true;invalidated=[];assert.equal((await post()).status,500);assert.deepEqual(invalidated,[]);
 fail=false;hidden=true;payload.status='archived';assert.equal((await post()).status,200);assert.deepEqual(invalidated,['bc']);
 const placements=[];
 const ads=load('app/api/public/article-ads/[scope]/route.ts',{
  'next/server':{NextResponse:{json:Response.json}},'@/lib/articleCache':{getArticleScope:scope=>({districtKey:scope})},
  '@/lib/supabase/admin':{createServiceClient:()=>({})},'@/lib/ads':{pickAndTrackAdsForPlacement:async options=>{placements.push([options.districtKey,options.placement,options.count]);return [{id:options.placement}] }},
 });
 const adResponse=await ads.POST(new Request('https://example.invalid/api/public/article-ads/bc?placement=homepage',{method:'POST'}),{params:Promise.resolve({scope:'bc'})});
 assert.equal(adResponse.status,200);assert.match(adResponse.headers.get('cache-control'),/no-store/);
 assert.deepEqual(placements,[['bc','allsite',1],['bc','homepage',3]]);
 const adBody=await adResponse.json();assert.equal(adBody.story,null);assert.equal(adBody.homepage[0].id,'homepage');
 console.log('PASS: query isolation and normalization, form/API exclusions, host spoof protection, CMS authentication, article routing, scoped invalidation, timed refresh, successful event publish/withdraw invalidation, failed-write preservation');
})().catch(error=>{console.error(error);process.exitCode=1});
