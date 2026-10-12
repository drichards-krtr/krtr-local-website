# Chunk 2 verification — October 12, 2026

## Passed locally

- Production build with Next.js 16.3.3, including TypeScript checking.
- Full automated suite: 37 checks passed, zero failures.
- Both dedicated Sales migrations execute in PostgreSQL/PGlite with minimal
  Supabase Auth stubs; the foundation tests remain passing.
- Customer creation scope, customer-specific district expansion, competing
  customer isolation, manager notification deduplication and broader district
  approval without self-approval.
- District/region/cross-region ownership transfer boundaries, original
  opportunity attribution, revoked old customer-specific access and histories.
- Pipeline goal/follow-up/lost-reason constraints, stale save rejection,
  reserved Signed/Won states and private immutable contact history.
- Exact verified-email invitation acceptance, member permission independence,
  accepted account-owner transfer, revocation/expiry/removal and disabled staff
  reactivation prevention. Stale regional authority rejects invitation inspection
  and acceptance. Optional own display-name updates grant no additional authority.
- Dual-role organization membership cannot expose KRTR internal notes.
- Owner-only primary district assignment and uniqueness.
- Unauthenticated mutations denied; customer email-status forgery denied.
- Random token hashing and mock email delivery verify stable idempotency,
  transient retries, exact recipient and explicit permanent/configuration errors.
  No real email was sent and no real Auth account was created.
- The three approved launch prospects seed idempotently; no unnamed Dysart
  prospect or business goals/contact facts are invented.
- Git fixture tests verify main/NRCS/Sales isolation, multi-commit comparisons,
  Sales-specific migrations, shared dependencies, missing-history behavior and
  documentation-only changes skipping all three applications.
- Local production-server smoke checks: setup is HTTP 200; root/protected/auth
  routes and all new customer/pipeline/access/invitation routes redirect to setup
  when database credentials are absent.
- Browser review of the updated setup screen and its build-progress message.
- `git diff --check` passes.

## Still pending

Dan reported Sales Vercel/domain setup complete. This work did not deploy changes
or change Vercel settings. The dedicated Sales Supabase project is still required
for real logins/customer operations. Actual Data API/Auth behavior, invitation
account creation, delivery to real inboxes, session/recovery flows, role changes
and deployed build-skip results remain to be verified after configuration.
Authenticated customer/pipeline screens compile but were not browser-tested
against a live database. PGlite tests do not simulate separate PostgreSQL network
sessions; transactional locking, uniqueness and version checks are present, but
live concurrency checks remain part of acceptance.

Invitation transport currently has bounded in-request retries plus actionable
manual reissue. The durable scheduled notification worker comes in Chunk 8.
Financial stages, inventory, agreements, payment, asset approvals, actual sale
commission records and fulfillment are not implemented by Chunk 2.

See `chunk-2-setup.md` for configuration and operation. No first-sale readiness
is declared. Changes remain local until committed/pushed/deployed.
