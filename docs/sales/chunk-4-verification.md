# Chunk 4 verification — October 29, 2026

## Local evidence

- Next.js production build passes, including TypeScript checks.
- Full automated suite: 84 checks passed, zero failures.
- Four real SQL migrations execute in PostgreSQL/PGlite with minimal Auth and
  Storage-role stubs; bucket configuration and scoped object policies execute.
- Authorized explicit exact-version signing; sharing/printing reserve nothing;
  atomic evidence/invoice/hold/allocation rollback on inventory conflict; retry
  deduplication; frozen agreement and commission attribution.
- Four Tuesday dates produce $100 advertising, or $115 with one new graphic,
  and exactly one $30 allocation through each of two test-only provider adapters.
  Verified notification works without a browser return; reconciliation/retries
  deduplicate. Invalid verification never reaches domain writes.
- Incorrect currency rejected; mismatched or extra actual captures retained for
  manager review; same transaction under different event IDs deduplicates.
- Receipt/deposit/clearance separation, manager-only clearance, whole-agreement
  scope across districts, live hold extension cap, late funds retained without
  reactivation, expiration notices deduplicated, service-only background expiry.
- Commission excludes assets/taxes, independent of processor fees/bank payout;
  refunds preserve original allocation; scoped refund-initiation authority.
- Real scoped customer transfer retains old sale allocation and future selling
  attribution changes; $600/$300 remaining/$15 discretionary takeover example.
- Owner partial withdrawals/retention prevent duplicate use; employee activation
  prerequisites, cutoff checks and owner exclusion from employee payroll.
- Private paper uploads, immutable signature evidence, customer invoice/receipt
  access, stranger/production-agent isolation and internal allocation/payroll hiding.
- BigInt aggregate currency formatting preserves cents beyond one invoice's safe
  integer range. Existing deployment-isolation and prior chunk tests still pass.
- Local unconfigured production smoke covers all protected/new routes and rejects
  unauthenticated hold-expiry jobs; setup remains an honest pending state.

## Limits and pre-live checks

No Sales Supabase project or credentials are configured in this checkout. Live
Auth, authenticated page walkthroughs, actual Storage uploads/downloads, browser
print layout, deployed cron execution, and independent-connection booking/ledger
contention still require connected verification. PGlite runs real SQL/RLS but has
one connection and minimal Auth/Storage stubs; it does not prove hosted concurrency
or real Storage behavior. Validate two exclusive and five cap-four signing attempts,
concurrent owner movements and repeated payment callbacks on hosted PostgreSQL.

No Stripe request, live customer invoice/payment, email, payroll/bank transfer,
Cloudinary operation, public ad change or NRCS fulfillment occurred. Last-minute
readiness is deliberately blocked until asset/capacity facts exist. Refund remedy
approval/rescheduling and reliable email jobs remain later chunks; no accepted
contract is silently changed. Do not infer first-sale readiness from local tests.
