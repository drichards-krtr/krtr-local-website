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

## Chunks and gates

1. **Foundation:** separate app, isolated variables/migrations/deployments,
   authentication, owner/role permissions, district/region/studio/show structure,
   setup-aware UI and tests. Local implementation complete only after checks pass;
   connected setup verification remains pending until Dan creates the project.
2. **Customers/pipeline:** organization invitations and permissions, ownership,
   district expansion/transfers and action-driven follow-ups.
3. **Catalogue/quotes/inventory:** immutable versions, prices, two-week coverage
   blocks, tax configuration, discounts, date/deadline rules, scoped overrides,
   transaction-safe exclusive/four-advertiser reservations.
4. **Agreements/financial foundation:** signing, holds, invoices, checks,
   provider-neutral events, commission/owner ledger and fake-provider tests.
5. **Assets/readiness:** intake, versioned previews/approval, per-asset fees and
   revision accounting, standing authorization, block reasons/exceptions, notices.
6. **Website migration:** eligible Sales-backed public interfaces, shared
   root/DLPC placement behavior, new sizes/layouts, concurrent-safe rotation,
   tracking, calendar and archived coverage credit; remove obsolete CMS ads.
7. **NRCS fulfillment:** agreed video layouts, authenticated idempotent contracts,
   rundown insertion/order/picker, persistent alerts, restore and delivery reports.
8. **Operations:** cancellation, refunds/make-goods, renewals, source-aware metrics,
   reliable scheduled notices and dashboards. Evaluate social automation with Dan
   without blocking unrelated work; manual entry remains an available fallback.
9. **Stripe plugin:** hosted checkout, verified webhooks, return verification,
   reconciliation, refunds, idempotency and late-payment conflict handling.
10. **Launch verification:** required four-Tuesday acceptance scenario, paid
    artwork scenario, complete edge cases, evidence and operational instructions.

Security, audits, meaningful tests and recovery are part of each chunk. Test
records/payments precede live campaigns. Employee payroll stays inactive until
its prerequisites; owner draw is available when the financial chunk is built.
No customer billing, external service provisioning or live advertising occurs
as part of the foundation build.
