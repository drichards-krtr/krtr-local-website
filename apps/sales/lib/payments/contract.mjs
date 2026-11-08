// Provider-neutral contract. A verified adapter result is a server-side capability,
// never a customer redirect or a browser-submitted "paid" flag.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validatePaymentEvent(event,provider){
 if(!event||!uuid.test(event.invoiceId)||!['captured','refunded','processor_fee','bank_payout'].includes(event.kind))throw new Error('Invalid normalized payment identity or kind.');
 if(!/^[a-z][a-z0-9_-]{0,39}$/.test(provider)||provider==='manual_check')throw new Error('Invalid payment provider.');
 if(event.currency!=='USD'||!Number.isSafeInteger(event.amountCents)||event.amountCents<=0)throw new Error('Invalid normalized currency or amount.');
 for(const field of ['eventId','transactionId'])if(typeof event[field]!=='string'||!event[field].trim()||event[field].length>250)throw new Error('Stable provider event and transaction identities required.');
 if(typeof event.occurredAt!=='string'||!Number.isFinite(Date.parse(event.occurredAt)))throw new Error('Verified occurrence timestamp required.');
 return {...event,occurredAt:new Date(event.occurredAt).toISOString()};
}
export function createPaymentService(provider,store){
 return {
 async checkout(invoiceId,returnUrl){
  const invoice=await store.eligibility(invoiceId);
  if(!invoice.eligible)throw new Error('Invoice is not eligible for a new payment.');
  return provider.createHostedCheckout({invoiceId:invoice.invoice_id,amountCents:invoice.amount_cents,currency:invoice.currency,returnUrl,idempotencyKey:'invoice:'+invoice.invoice_id});
 },
 async notification(rawBody,headers){
  const events=await provider.verifyNotification(rawBody,headers);
  return Promise.all(events.map(e=>store.record(validatePaymentEvent(e,provider.id),provider.id)));
 },
 async reconcile(invoiceId){
  // Ownership/read access is checked even for a read-only reconciliation request.
  await store.eligibility(invoiceId);
  const events=await provider.lookupPayment(invoiceId);
  if(events.some(e=>e.invoiceId!==invoiceId))throw new Error('Provider reconciliation returned a different invoice.');
  return Promise.all(events.map(e=>store.record(validatePaymentEvent(e,provider.id),provider.id)));
 },
 async refund(invoiceId,amountCents,requestId){
  if(!store.authorizeRefund)throw new Error('Manager refund authorization is required.');
  await store.authorizeRefund(invoiceId,amountCents);
  if(!Number.isSafeInteger(amountCents)||amountCents<=0||!uuid.test(requestId))throw new Error('Valid refund amount and stable request identity required.');
  // Caller must authorize the remedy first; only verified returned events affect the ledger.
  const events=await provider.refund({invoiceId,amountCents,idempotencyKey:'refund:'+requestId});
  if(events.some(e=>e.invoiceId!==invoiceId||e.kind!=='refunded'))throw new Error('Provider returned an invalid refund result.');
  return Promise.all(events.map(e=>store.record(validatePaymentEvent(e,provider.id),provider.id)));
 }
 };
}
