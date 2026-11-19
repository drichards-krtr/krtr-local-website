import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {inspectAssetImage,boundedImageBytes,MAX_ASSET_BYTES,privateImageUrl,signCloudinary} from '../lib/asset-media-core.mjs';
import {centralTimestamp} from '../lib/central-time.mjs';

test('uploaded bytes enforce dimensions, actual transparency and static safe formats',async()=>{
 const image=async(width,height,alpha=1)=>sharp({create:{width,height,channels:4,background:{r:30,g:60,b:90,alpha}}}).png().toBuffer();
 const banner=await image(1800,200);const result=await inspectAssetImage(banner,'banner');
 assert.equal(result.sha256,createHash('sha256').update(banner).digest('hex'));
 await assert.rejects(inspectAssetImage(banner,'display'),/dimensions/);
 await assert.rejects(inspectAssetImage(await image(500,500),'logo'),/transparent/);
 assert.equal((await inspectAssetImage(await image(500,500,0),'logo')).transparent,true);
 await assert.rejects(inspectAssetImage(Buffer.from('<svg width="1800" height="200"></svg>'),'banner'),/static/);
 await assert.rejects(inspectAssetImage(Buffer.alloc(MAX_ASSET_BYTES+1),'banner'),/8 MB/);
});
test('private downloads are signed, short lived and bounded while streaming',async()=>{
 const c={cloudName:'example',apiKey:'test-key',apiSecret:'test-secret'};
 const url=new URL(privateImageUrl(c,'krtr-sales/org/asset/upload','png',1000000));
 assert.equal(url.searchParams.get('expires_at'),'1120');
 assert.equal(url.searchParams.get('type'),'authenticated');
 assert.ok(!url.href.includes(c.apiSecret));
 assert.equal(signCloudinary({b:'two',a:'one'},'secret'),signCloudinary({a:'one',b:'two'},'secret'));
 assert.deepEqual(await boundedImageBytes(new Response(new Uint8Array([1,2]))),Buffer.from([1,2]));
 let canceled=false;
 const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(MAX_ASSET_BYTES+1));},cancel(){canceled=true;}});
 await assert.rejects(boundedImageBytes(new Response(stream)),/8 MB/);assert.ok(canceled);
});
test('Central input rejects missing and ambiguous DST times and invalid calendar dates',()=>{
 assert.equal(centralTimestamp('2030-01-15T17:00'),'2030-01-15T23:00:00.000Z');
 assert.equal(centralTimestamp('2030-07-15T17:00'),'2030-07-15T22:00:00.000Z');
 for(const value of ['2030-03-10T02:30','2030-11-03T01:30','2030-02-30T12:00','2030-01-01'])assert.throws(()=>centralTimestamp(value));
});
