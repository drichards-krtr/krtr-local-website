import "server-only";
export type PaymentEvent={invoiceId:string;eventId:string;transactionId:string;kind:"captured"|"refunded"|"processor_fee"|"bank_payout";amountCents:number;currency:"USD";occurredAt:string};
export interface PaymentProvider {
 id:string;
 createHostedCheckout(input:{invoiceId:string;amountCents:number;currency:string;returnUrl:string;idempotencyKey:string}):Promise<{url:string;sessionId:string}>;
 verifyNotification(rawBody:string,headers:Record<string,string>):Promise<PaymentEvent[]>;
 lookupPayment(invoiceId:string):Promise<PaymentEvent[]>;
 refund(input:{invoiceId:string;amountCents:number;idempotencyKey:string}):Promise<PaymentEvent[]>;
}
// Stripe is intentionally added in its later chunk. No fake provider is installed
// in the app; fake adapters exist only in automated tests.
export function configuredPaymentProvider():PaymentProvider|null{return null;}
