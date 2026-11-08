# Chunk 4: agreements and financial foundation

## Current state and setup

Implemented locally on October 29, 2026. No live customer billing, bank action,
email, payroll run, deployment or external provisioning was performed.

Continue using the dedicated **krtr-sales-production** Supabase project. When Dan
creates it, apply all four `apps/sales/supabase/migrations` in filename order and
complete the owner/Auth/environment setup from Chunks 1–3. The fourth migration
is transactional and creates the private `sales-agreements` Storage bucket with
PDF-only uploads, a 10 MB limit, staff-scoped insertion and authenticated reads.
The migration skips Storage configuration in a database without Supabase Storage;
that does not make paper uploads usable outside Supabase. Do not expose the bucket
publicly or add object update/delete policies. Aborted paper-signing attempts can
leave private unattached uploads; retain them for authorized later cleanup rather
than deleting signed evidence.

No new Cloudinary or payment-provider account is needed. Supabase Storage holds
private signature evidence; shared Cloudinary remains for later advertising media.

## Agreement, invoice and check workflow

1. Prepare and share a quote with complete tax settings, exact dates and deadlines.
   The customer opens the quote, reviews the printable version and explicitly
   accepts with an authorized signer name. View permission alone cannot sign.
2. Signing rechecks the current shared version, permissions, elapsed deadlines,
   sponsor discount entitlement, exceptions and inventory. Agreement evidence,
   invoice, initial allocation and inventory hold commit in one SQL transaction.
   A conflict rolls all of them back. Retries do not issue additional invoices.
3. For paper: print the exact version, obtain the signature, and upload its PDF
   from that quote with actual signer/date and staff attestation. Printing alone
   reserves nothing. Paper dates are retained at date precision; the hold is
   calculated from that signature date, not restarted on upload. An already
   expired paper hold cannot be made live by backdating its upload.
4. Agreements & invoices shows frozen deliverables, prices, policy version,
   deadline recap, payment receipts and inventory state. Paper evidence URLs are
   private and short-lived. Digital and paper acceptance retain immutable evidence.
5. Staff records check receipt and deposit from Payments & holds. Only the owner
   or a district/regional manager covering the entire agreement verifies clearance.
   Receipt and deposit are not payment. Check receipt extends an actually live
   hold only through the earlier campaign payment deadline; a late-recorded or
   backdated receipt does not restore inventory. Return of an uncleared check is
   a manager action. A cleared check requiring reversal needs reconciliation.
6. Verified capture or check clearance records a receipt and makes the original
   30% advertising allocation payable. Assets, revisions and tax are excluded;
   processor fees and bank payouts are separate facts. Won means signed/paid,
   not production-ready. Late funds are recorded with a booking conflict and no
   automatic inventory restoration or date shifting.

Check payee defaults to **KRTR Local, LLC**. Mailing/drop-off instructions remain
empty. Only Dan can supply verified instructions under Finance settings. Until
then invoices say mailing instructions pending/contact salesperson, never a home
or guessed address. Card checkout honestly shows setup pending until Chunk 9.

Last-minute signing remains blocked until Chunk 5 can verify actual paid/approved
materials and production capacity. No readiness checkbox can fabricate those facts.
Signed deadline amendments, cancellation/refund remedies and rescheduling remain
later operational work; this chunk cannot silently edit accepted terms.

## Allocations and payouts

- Each agreement snapshots the current selling staff member at signing, separately
  from current customer ownership. Transfers use the existing scoped transfer RPC;
  they do not rewrite signed-sale attribution or amounts. The original seller can
  still read their allocation even after customer access transfers.
- Dan's Owner draw supports partial withdrawn/reinvested records with actual
  dates and references. Reinvested means retained in the business. Allocation
  locking prevents double use; request identities make retries idempotent.
- Discretionary takeover allocation is an additional 5% KRTR expense approved by
  a manager with whole-agreement authority. The current new seller must differ
  from the original seller. Record the actual undelivered advertising value and
  supporting dates/reason. No automatic delivery estimate is invented. A $600
  campaign with documented $300 remaining produces $15 additional allocation,
  preserving the original allocation. Repeated allocations to the same successor
  are rejected.
- Employee payouts default inactive. Dan may configure a biweekly payday anchor,
  cutoff (days before payday, at 5pm Central), and explicitly confirm hiring,
  employer and agreement prerequisites. Scheduling requires all settings and
  collected employee allocations before cutoff. Owner draw cannot enter payroll.
  Manual paid-date/reference tracking is not a payroll-provider integration and
  does not initiate transfers. Do not activate before hiring setup is complete.
- Refund facts do not claw back commissions. No wage deduction/error-review
  policy is invented. Remaining 70% advertising revenue is before other costs.

## Provider boundary

`lib/payments/provider.ts` defines hosted checkout, authenticated notification
verification, reconciliation lookup and refund methods. `contract.mjs` maps only
verified normalized events into provider-neutral domain operations. There is no
configured production adapter or public payment webhook in Chunk 4. Fake adapters
exist only in tests; there is no fake-payment UI or production environment switch.

The trusted `sales_record_provider_event` RPC is service-only. Invoice ownership,
checkout eligibility, amount/currency, transaction and event identities are checked.
Different event IDs for the same captured transaction deduplicate. Unexpected real
amounts or additional distinct captured payments are recorded honestly with a
manager-review flag; they do not earn another allocation or activate inventory.
Refund initiation requires scoped manager authorization. Verified refund events
remain capped by actual collected funds. Chunk 8/9 will implement remedy decisions,
provider reconciliation failures, operational resolution and live provider calls.

Processor-specific identifiers remain audit metadata on normalized events, not
booking or commission rules. Raw provider payloads/credential handling belong to
future adapters. Customer receipts omit fees, allocations and internal events.

## Hold expiry job (configure before live use)

Set server-only `SALES_CRON_SECRET` to a random value of at least 32 characters in
Sales Vercel. Configure a reliable authorized scheduler to GET:

`https://sales.krtrlocal.tv/api/jobs/expire-holds`

with header `Authorization: Bearer <SALES_CRON_SECRET>` at an appropriate recurring
interval (five minutes is a deployment recommendation, not a business deadline).
This route rejects unauthenticated calls and uses the dedicated Sales service key.
No scheduler was provisioned or assumed active. Dashboard staff can run scoped
expiry manually. Booking and payment eligibility enforce exact expiry timestamps
even when the job has not yet run; a delayed job cannot extend eligibility.

Expiry writes deduplicated dashboard notices to customer/selling staff/affected
managers. Full reliable milestone/reminder email scheduling remains Chunk 8,
using the existing email service. This chunk sends no new email automatically.

All changed code/migrations are Sales-local; deployment isolation checks continue
to cover main/CMS, NRCS and Sales. No push/deployment was performed.
