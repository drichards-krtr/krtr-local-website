import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = process.cwd();
const cache = new Map();
function loadTs(filename) {
  if(cache.has(filename))return cache.get(filename);
  const result={exports:{}};
  cache.set(filename,result.exports);
  const source=ts.transpileModule(readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const localRequire=name=>{
    if(name==="server-only")return {};
    if(name.startsWith("."))return loadTs(path.resolve(path.dirname(filename),name+".ts"));
    return require(name);
  };
  vm.runInThisContext("(function(require,module,exports){"+source+"\n})",{filename})(localRequire,result,result.exports);
  cache.set(filename,result.exports);return result.exports;
}
const graphics=loadTs(path.join(root,"lib/graphics.ts"));
const {generatorDocument}=loadTs(path.join(root,"lib/generators/document.ts"));
const {composeCoopLogo}=loadTs(path.join(root,"lib/schoolLogos.ts"));
const cloudinary=loadTs(path.join(root,"lib/cloudinary.ts"));
const sharp=require("sharp");
const pairs=[["Union Knights","union-knights.png"],["Clear Creek Amana","clear_creek_amana-clippers.png"],["Columbus Catholic","columbus_catholic-sailors.png"],["Dike-New Hartford","dike_new_hartford-wolverines.png"],["Hudson","hudson-pirates.png"],["Independence","independence-mustangs.png"],["Lake Mills","lake_mills-bulldogs.png"],["North Butler","north_butler-bobcats.png"],["Oelwein","oelwein-huskies.png"],["Osage","osage-green_devils.png"],["South Hardin","south_hardin-tigers.png"],["Wapsie Valley","wapsie_valley-warriors.png"],["Mount Vernon","mount_vernon-mustangs.png"],["Waverly-Shell Rock","waverly_shell_rock-go_hawks.png"],["Decorah","decorah-vikings.png"],["New Hampton","new_hampton-chickasaws.png"],["Anamosa","anamosa-blue_raiders.png"],["Co-op Waterloo East","union-east.png"],["Co-Op Waterloo West","union-west.png"],["Co-Op Waterloo United","union-united.png"],["Waterloo East","waterloo-east.png"],["Waterloo West","waterloo-west.png"],["Waterloo United","waterloo-united.jpg"],["South Tama County","south_tama_county-trojans.png"],["Cedar Falls","cedar_falls-tigers.png"],["Hillcrest Academy","hillcrest_academy-ravens.png"],["Jesup","jesup-j_hawks.png"],["Cedar Rapids Jefferson","cedar_rapids_jefferson-j_hawks.png"],["Grundy Center","grundy_center-spartans.png"]];
const schools=pairs.map(([display_name,file],i)=>({id:String(i),name:display_name,mascot:"Mascot",display_name,kind:/^co-op/i.test(display_name)?"coop":"school",logo_url:null,legacy_logo_path:"/graphics/legacy/"+file,primary_school_id:null,partner_school_id:null,composition_recipe:null}));
const originalConfig="window.KRTR_SCHOOL_MASCOTS="+JSON.stringify(Object.fromEntries(pairs))+";";
const primary=schools.find(row=>row.display_name==="Union Knights");
const partner=schools.find(row=>row.display_name==="Waterloo East");
const composite=await composeCoopLogo(primary,partner);
const compositeMetadata=await sharp(composite).metadata();
assert.equal(compositeMetadata.format,"png");
assert.equal(compositeMetadata.width,1024);
assert.equal(compositeMetadata.height,1024);
assert.equal((await sharp(composite).stats()).isOpaque,false);
const expectedBase=await sharp(readFileSync(path.join(root,"public",primary.legacy_logo_path))).resize(1024,1024,{fit:"contain",background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
const unchanged=await sharp(composite).extract({left:0,top:0,width:1024,height:512}).raw().toBuffer();
const baseTop=await sharp(expectedBase).extract({left:0,top:0,width:1024,height:512}).raw().toBuffer();
assert.deepEqual(unchanged,baseTop,"Partner overlay must leave the top half unchanged");
const preservedEnv=Object.fromEntries(["CLOUDINARY_URL","CLOUDINARY_CLOUD_NAME","CLOUDINARY_API_KEY","CLOUDINARY_API_SECRET"].map(key=>[key,process.env[key]]));
try {
  process.env.CLOUDINARY_CLOUD_NAME="cloudinary://test-key:test-secret@example-cloud";
  delete process.env.CLOUDINARY_URL;delete process.env.CLOUDINARY_API_KEY;delete process.env.CLOUDINARY_API_SECRET;
  assert.deepEqual(cloudinary.getCloudinaryCredentials(),{cloudName:"example-cloud",apiKey:"test-key",apiSecret:"test-secret"});
  process.env.CLOUDINARY_CLOUD_NAME="example-cloud";process.env.CLOUDINARY_API_KEY="test-key";process.env.CLOUDINARY_API_SECRET="test-secret";
  assert.equal(cloudinary.getCloudinaryCredentials().cloudName,"example-cloud");
  assert.equal(cloudinary.signCloudinaryParameters({timestamp:"123",public_id:"x",overwrite:"false"},"test-secret"),createHash("sha256").update("overwrite=false&public_id=x&timestamp=123test-secret").digest("hex"));
} finally {for(const [key,value] of Object.entries(preservedEnv))if(value===undefined)delete process.env[key];else process.env[key]=value;}
const unsafe={...primary,display_name:"</script><script>window.injected=true</script>"};
assert.ok(generatorDocument("sports",[unsafe],unsafe.id).includes("\\u003c/script>"));
const runtime=process.env.KRTR_TEST_NODE_MODULES;
const {chromium}=runtime ? createRequire(path.join(runtime,"package.json"))("playwright") : require("playwright");
const server=createServer((req,res)=>{
  const pathname=new URL(req.url,"http://localhost").pathname;
  if(pathname==="/config.js"){res.setHeader("Content-Type","text/javascript");res.end(originalConfig);return;}
  if(pathname.startsWith("/mascots/")||pathname.startsWith("/graphics/legacy/")){
    const file=path.basename(pathname);
    if(!pairs.some(([,name])=>name===file)){res.writeHead(404).end();return;}
    res.setHeader("Content-Type",file.endsWith(".jpg")?"image/jpeg":"image/png");
    res.end(readFileSync(path.join(root,"public/graphics/legacy",file)));return;
  }
  res.setHeader("Content-Type","text/html");res.end("<!doctype html><html><body></body></html>");
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
const browser=await chromium.launch({headless:true,channel:process.env.KRTR_TEST_BROWSER_CHANNEL || undefined});
const artifacts=path.join(root,".phase5-checks");mkdirSync(artifacts,{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.route(/weather.gov\/images\/nws\/newicons\/|api\/graphics\/weather-icon/,route=>route.fulfill({contentType:"image/png",body:readFileSync(path.join(root,"public/graphics/legacy/union-knights.png"))}));
  async function mount(html) {
    await page.goto(origin);
    await page.evaluate(html=>{
      const frame=document.createElement("iframe");
      frame.id="builder";frame.title="Graphics test";frame.style.cssText="width:100%;height:900px;border:0";frame.srcdoc=html;document.body.style.margin="0";document.body.appendChild(frame);
    },html);
    const frame=page.frameLocator("#builder");
    await frame.locator("#preview").waitFor();
    await page.waitForFunction(()=>window.frames[0].document.querySelector("#format"));
    return page.frames()[1];
  }
  async function pixels(frame,format,ported) {
    return frame.evaluate(async({format,ported})=>{
      document.getElementById("format").value=format;
      if(typeof exporting!=="undefined")exporting=true;
      await draw();
      // Flush any initialization draws after their images finish loading.
      if(typeof imageCache!=="undefined")await Promise.all(imageCache.values());
      await draw();
      const canvas=document.getElementById("preview");
      const ctx=canvas.getContext("2d");
      const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      const digest=await crypto.subtle.digest("SHA-256",data);
      return {hash:Array.from(new Uint8Array(digest)).map(value=>value.toString(16).padStart(2,"0")).join(""),width:canvas.width,height:canvas.height,nonblank:data.some(value=>value!==0)};
    },{format,ported});
  }
  for(const builder of graphics.GRAPHIC_BUILDERS) {
    const original=loadTs(path.join(root,"lib/generators/"+builder+".ts")).default;
    const baseline=await mount(original);
    const hashes={};
    for(const format of ["vertical","horizontal","krtr"])hashes[format]=await pixels(baseline,format,false);
    const doc=generatorDocument(builder,schools,primary.id);
    const frame=await mount(doc);
    for(const format of ["vertical","horizontal","krtr"]) {
      const result=await pixels(frame,format,true);
      assert.equal(result.nonblank,true,builder+" "+format+" must be nonblank");
      assert.deepEqual(result,hashes[format],builder+" "+format+" output must match original pixels");
    }
    await frame.evaluate(()=>{if(typeof exporting!=="undefined")exporting=false;});
    await page.screenshot({path:path.join(artifacts,builder+"-desktop.png"),fullPage:true});
    await frame.evaluate(()=>{document.getElementById("format").value="krtr";});
    const blobInfo=await frame.evaluate(async()=>{const {blob}=await captureGraphic();return {type:blob.type,size:blob.size};});
    assert.equal(blobInfo.type,"image/png");assert.ok(blobInfo.size>1000);
    await page.evaluate(()=>{
      window.captureReceived=null;
      window.addEventListener("message",event=>{
        if(event.data?.type==="graphic-captured")window.captureReceived={origin:event.origin,type:event.data.blob.type,size:event.data.blob.size};
      });
      document.getElementById("builder").contentWindow.postMessage({type:"capture-graphic"},location.origin);
    });
    await page.waitForFunction(()=>window.captureReceived);
    const received=await page.evaluate(()=>window.captureReceived);
    assert.equal(received.origin,origin);
    assert.equal(received.type,"image/png");assert.ok(received.size>1000);
    const download=page.waitForEvent("download");
    await frame.locator("#export").click();
    assert.ok((await download).suggestedFilename().endsWith(".png"));
    await page.setViewportSize({width:390,height:900});
    await frame.evaluate(async()=>{await draw();});
    assert.equal(await frame.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false,builder+" mobile should not overflow horizontally");
    await page.screenshot({path:path.join(artifacts,builder+"-mobile.png"),fullPage:true});
    await page.setViewportSize({width:1440,height:1000});
    console.log("PASS: "+builder+" pixel parity (3 formats), PNG capture/download, desktop/mobile layout");
  }
  assert.deepEqual(errors,[],"No browser script errors");
  console.log("PASS: Co-op PNG composition, credential parsing, signature, script escaping");
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
