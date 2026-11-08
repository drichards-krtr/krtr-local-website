import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {createPaymentService} from '../lib/payments/contract.mjs';
const invoice='20000000-0000-4000-8000-000000000001';
const event={invoiceId:invoice,eventId:'captured-1',transactionId:'transaction-1',kind:'captured',amountCents:10000,currency:'USD',occurredAt:'2030-01-01T12:00:00Z'};
// Test-only adapter: never exported by or configured in the application.
function fake(id){return {id,async createHostedCheckout(input){return {url:'https://example.invalid/test-checkout',sessionId:input.idempotencyKey};},async verifyNotification(body,headers){const expected=createHmac('sha256','test-only-secret').update(body).digest('hex');const signature=headers.signature||'';if(signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))throw new Error('Unverified notification');return JSON.parse(body);},async lookupPayment(){return [event];},async refund(input){return [{...event,eventId:input.idempotencyKey,kind:'refunded',amountCents:input.amountCents}];}};}
test('two replaceable adapters use the same domain store; signature verification precedes writes',async()=>{
 for(const name of ['fake_one','fake_two']){const facts=new Map();const service=createPaymentService(fake(name),{async authorizeRefund(){},async eligibility(){return {invoice_id:invoice,amount_cents:10000,currency:'USD',eligible:true};},async record(e,provider){const key=provider+e.eventId;if(!facts.has(key))facts.set(key,e);return key;}});
 const body=JSON.stringify([event]);await assert.rejects(service.notification(body,{signature:'forged'}),/Unverified/);assert.equal(facts.size,0);
 const signature=createHmac('sha256','test-only-secret').update(body).digest('hex');await service.notification(body,{signature});await service.notification(body,{signature});await service.reconcile(invoice);assert.equal(facts.size,1);
 assert.equal((await service.checkout(invoice,'https://example.invalid/return')).sessionId,'invoice:'+invoice);
 await service.refund(invoice,2500,'20000000-0000-4000-8000-000000000002');assert.equal(facts.size,2);
 }
});
test('ineligible checkout and invalid normalized amounts never reach a provider/domain write',async()=>{
 const provider=fake('test_processor');let called=false;provider.createHostedCheckout=async()=>{called=true;};const service=createPaymentService(provider,{async eligibility(){return {eligible:false};},async record(){called=true;}});
 await assert.rejects(service.checkout(invoice,'https://example.invalid'),/not eligible/);assert.equal(called,false);
 const body=JSON.stringify([{...event,amountCents:100.5}]);const signature=createHmac('sha256','test-only-secret').update(body).digest('hex');await assert.rejects(service.notification(body,{signature}),/amount/);assert.equal(called,false);
});

test("refund contract refuses adapters without manager authorization",async()=>{const service=createPaymentService(fake("test_processor"),{});await assert.rejects(service.refund(invoice,100,"20000000-0000-4000-8000-000000000002"),/Manager refund authorization/);});
