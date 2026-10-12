import test from "node:test";
import assert from "node:assert/strict";
import { invitationHash, newInvitationToken, deliverInvitation } from "../lib/invitation-core.mjs";
const input={id:"test-invitation",email:"customer@example.invalid",company:"Example business",url:"https://sales.example.invalid/invite?token=test",apiKey:"fake-test-key",from:"sales@example.invalid"};
test("tokens have 256-bit entropy and only hashes are stored",()=>{
 const one=newInvitationToken(),two=newInvitationToken();assert.match(one,/^[0-9a-f]{64}$/);assert.notEqual(one,two);assert.notEqual(invitationHash(one),one);assert.equal(invitationHash(one).length,64);assert.throws(()=>invitationHash("short"));
});
test("email retries preserve logical idempotency and exact intended recipient",async()=>{
 const calls=[];
 const providerId=await deliverInvitation({...input,fetcher:async(url,options)=>{calls.push({url,options});if(calls.length===1)throw Error("Network failure");if(calls.length===2)return {ok:false,status:503,json:async()=>({})};return {ok:true,status:200,json:async()=>({id:"email-verified"})};}});
 assert.equal(providerId,"email-verified");assert.equal(calls.length,3);
 for(const call of calls){assert.equal(call.options.headers["Idempotency-Key"],"sales-invite/test-invitation");const body=JSON.parse(call.options.body);assert.deepEqual(body.to,[input.email]);assert.ok(body.text.includes(input.url));assert.equal(body.from,input.from);}
});
test("configuration and permanent provider failure stay explicit, not falsely sent",async()=>{
 let count=0;await assert.rejects(deliverInvitation({...input,apiKey:"",fetcher:async()=>{count++;}}),/existing Resend/);assert.equal(count,0);
 await assert.rejects(deliverInvitation({...input,fetcher:async()=>{count++;return {ok:false,status:422,json:async()=>({})};}}),/rejected/);assert.equal(count,1);
});
