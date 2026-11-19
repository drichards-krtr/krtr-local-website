# Sales Phase 1 implementation plan

Authority: Sales Phase 1 Launch specification dated October 11, 2026 and Dan's
subsequent clarifications in this chat. The original PDF remains at
`C:/Users/Dan/Desktop/Sales Phase 1 Launch - Codey Build Prompt.pdf`.

## Accepted clarifications

- Dedicated Sales Supabase project: `krtr-sales-production`. Dan will create it
  later; foundation development must work without the project.
- Root and DLPC homepages share DLPC homepage inventory while the root falls back
  to DLPC content. Do not create two exclusive sales for the same purchase.
- Longer coverage sponsorships use whole two-week increments.
- Tax settings are configurable by Sales Manager or higher, mapped to scoped
  district/regional managers and owner; no tax values are invented.
- Studio and show sponsor in-video layouts are reviewed just before building
  those production integrations; do not turn them into unsolicited web banners.
- Provider-neutral financial domain comes early; Stripe adapter near the end.
- Sales is a separate Vercel app in this repository; app-only commits must not
  redeploy unrelated projects.
- Added November 18, 2026: include the existing Chamber Event Highlight
  administration handoff to Sales. Schedule it as Chunk 6B below; this scope
  addition authorizes planning now, not immediate implementation or retirement
  of the existing NRCS controls. See [the handoff plan](./chamber-highlight-handoff-plan.md).

Current infrastructure status: the dedicated Sales database is now created,
the existing migrations and hosted clearance fix are applied, and Dan confirmed
successful owner sign-in on the live Sales app. Historical connected-check gates
below are partly satisfied; remaining verification is tracked in
[the hosted setup record](./hosted-setup-2026-11-18.md). Chunk 5 has not started.

## Chunks and gates

1. **Foundation:** separate app, isolated variables/migrations/deployments,
   authentication, owner/role permissions, district/region/studio/show structure,
   setup-aware UI and tests. Local implementation complete only after checks pass;
   connected setup verification remains pending until Dan creates the project.
2. **Customers/pipeline:** locally implemented organization invitations and permissions,
   ownership, district expansion/transfers and action-driven follow-ups. Connected
   verification remains pending until the Sales Supabase project/email are configured.
3. **Catalogue/quotes/inventory:** locally implemented; connected Auth/UI and
   independent-connection booking verification awaits the Sales database. Immutable versions, prices, two-week coverage
   blocks, tax configuration, discounts, date/deadline rules, scoped overrides,
   transaction-safe exclusive/four-advertiser reservations.
4. **Agreements/financial foundation:** locally implemented signing, holds, invoices,
   checks, provider-neutral events, commission/owner ledger and fake-provider tests.
   Connected Auth/Storage, scheduled expiry and independent-connection verification
   await the dedicated Sales Supabase project. Stripe remains Chunk 9.
5. **Assets/readiness:** intake, versioned previews/approval, per-asset fees and
   revision accounting, standing authorization, block reasons/exceptions, notices.
6. **Website migration:** eligible Sales-backed public interfaces, shared
   root/DLPC placement behavior, new sizes/layouts, concurrent-safe rotation,
   tracking, calendar and archived coverage credit; remove obsolete CMS ads.
   **6B. Chamber Event Highlight administration handoff:** add the authorized
   Sales account/contact/status/district-coverage workflows using the existing
   CMS API and dedicated Sales credential. Preserve CMS record authority and IDs,
   NRCS event assignment/publication, and existing calendar presentation. Confirm
   Sales administrator roles and district mapping; verify the complete handoff
   while retaining NRCS administration. Request Dan's explicit cutover approval
   only after Sales is deployed and verified, then retire the NRCS admin surface
   through the flags on both apps and verify that event highlights still work.
7. **NRCS fulfillment:** agreed video layouts, authenticated idempotent contracts,
   rundown insertion/order/picker, persistent alerts, restore and delivery reports.
8. **Operations:** cancellation, refunds/make-goods, renewals, source-aware metrics,
   reliable scheduled notices and dashboards. Evaluate social automation with Dan
   without blocking unrelated work; manual entry remains an available fallback.
9. **Stripe plugin:** hosted checkout, verified webhooks, return verification,
   reconciliation, refunds, idempotency and late-payment conflict handling.
10. **Launch verification:** required four-Tuesday acceptance scenario, paid
    artwork scenario, Chamber handoff/cutover regression, complete edge cases,
    evidence and operational instructions.

Chunk numbering stays stable. From the current pause after Chunk 4, six numbered
chunks remain (5–10), plus the added 6B work package. Chunk 6B precedes Chunk 7;
it does not depend on Stripe and does not define a new catalogue price or billing
policy. It has its own verified-deployment and explicit-retirement approval gate.

Security, audits, meaningful tests and recovery are part of each chunk. Test
records/payments precede live campaigns. Employee payroll stays inactive until
its prerequisites; owner draw is available when the financial chunk is built.
No customer billing, external service provisioning or live advertising occurs
as part of the foundation build.
