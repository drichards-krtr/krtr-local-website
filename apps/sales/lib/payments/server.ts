import "server-only";
import {createSalesAdminClient} from "@/lib/admin";
import {createPaymentService} from "./contract.mjs";
import type {PaymentProvider,PaymentEvent} from "./provider";
type ScopedClient=Awaited<ReturnType<typeof import("@/lib/auth").requireSalesIdentity>>["supabase"];
export function paymentService(provider:PaymentProvider,client:ScopedClient){
 return createPaymentService(provider,{
  async authorizeRefund(invoiceId:string,amountCents:number){const {error}=await client.rpc("sales_refund_eligibility",{p_invoice:invoiceId,p_cents:amountCents});if(error)throw new Error(error.message);},
  async eligibility(invoiceId:string){const {data,error}=await client.rpc("sales_payment_eligibility",{p_invoice:invoiceId});if(error)throw new Error(error.message);return data;},
  async record(event:PaymentEvent,providerId:string){const {data,error}=await createSalesAdminClient().rpc("sales_record_provider_event",{p_invoice:event.invoiceId,p_provider:providerId,p_key:event.eventId,p_transaction:event.transactionId,p_kind:event.kind,p_cents:event.amountCents,p_currency:event.currency,p_occurred:event.occurredAt});if(error)throw new Error(error.message);return data;}
 });
}
