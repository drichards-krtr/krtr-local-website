# Chunk 5 pause — November 18, 2026

Dan explicitly requested stopping here. When he returns asking what's next,
first ask him to add the existing KRTR `RESEND_API_KEY` as a Sensitive variable
and `SALES_EMAIL_FROM` with the existing verified sender to Sales Vercel
Production. Never request the key in chat. He has already added `CLOUDINARY_URL`
and redeployed; its Production secret presence was verified.

Chunk 5 implementation is local and unfinished. The new migration
`20261119041701_assets_approvals_readiness.sql` has NOT been applied to hosted
Supabase. Chunk 5 source has NOT been deployed. No production emails were sent.

Latest verification: 101 tests passed, production build passed, typecheck passed.
Sales Next.js was updated from 16.3.3 to pinned 16.4.6 to resolve the existing
reported vulnerabilities; npm install then reported zero vulnerabilities.

Local work covers asset intake, private Cloudinary uploads and validated image
bytes, immutable versions/customer reviews, per-asset revision orders and
supplemental invoices, scoped/date-bound creative bindings, campaign readiness,
earlier approval requests/customer acceptance, manager exceptions and an email
outbox. Production fulfillment remains Chunk 7. Last-minute signing remains
strictly blocked pending a verified pre-sign payment/asset/capacity flow.

Before deployment: finish security/permission and UI review, add normal-ready,
changed-intake/tax and supplemental-check regression tests; verify hosted schema
and rollback workflow after applying the migration; run Supabase advisors;
verify connected uploads and notice configuration; update progress/setup docs;
deploy only Sales and verify its routes. Preserve all app deployment isolation.
Do not claim live uploads/email have been tested. Scheduled outbox retry setup
still needs verification (existing action attempts alone are not a scheduler).

Preserve the separate Chamber handoff planning changes (Chunk 6B). Clean up only
the generated Sales Supabase `.temp` files after inspecting them. Do not change
CMS/NRCS dependencies or deployment filters.
