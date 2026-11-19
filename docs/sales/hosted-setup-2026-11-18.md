# Sales hosted database setup — November 18, 2026 (America/Chicago)

## Created and verified

- Organization: KRTR Local (`oiwemumwzesyuufkayuv`).
- Project: `krtr-sales-production`, reference `vhmvhfhzklqrtaowiqkh`.
- Region: `us-east-2`, matching the existing CMS and NRCS projects.
- PostgreSQL: 17.12.0.000; status ACTIVE_HEALTHY.
- Dashboard: https://supabase.com/dashboard/project/vhmvhfhzklqrtaowiqkh
- API: https://vhmvhfhzklqrtaowiqkh.supabase.co
- Applied the four existing Sales migrations and a fifth hosted-verification fix.
  Remote migration versions were aligned with the source filenames after the
  connector assigned execution-time IDs. Future migration tools must use only
  `apps/sales/supabase`; never link the repository's root CMS migration directory.
- All 44 public Sales tables have RLS. The two unexposed private review tables
  now also have RLS as defense in depth. All role grants remain explicit.
- `sales-agreements` Storage bucket is private, PDF-only, maximum 10 MB.
- Catalogue: 12 approved products. DLPC is the only district; Morning Kickstart
  remains the initial show. No studio/region/customer/tax assumptions were added.
- Dan created and confirmed his Auth account through the dashboard. The verified
  exact account was activated and granted the singleton owner binding. The real
  `sales_workspace_context` reports owner and sales-staff access.

## Hosted and local evidence

The initial hosted script in `apps/sales/supabase/verification/initial-hosted-check.sql`
executed real role policies and domain functions in a transaction, then rolled
back all fixtures. It verifies four Tuesday Specials for $100, signing/invoice/
hold creation, receipt versus cleared check, seller clearance denial, manager
clearance, exactly one receipt and one $30 allocation, four booked dates, and
unrelated-user isolation. No customer or invoice from that test remains. The script
intentionally refuses to run after owner/customer initialization.

Hosted testing found that manual check clearance after 5pm could fabricate a 5pm
event time earlier than invoice creation. Migration
`20261119035321_hosted_check_clearance_hardening.sql` fixes this: the actual entered
cleared date stays on the check; the normalized event records the current
verification time. Its timestamp is not a guessed clearing-bank time.

The full local suite passes **85 tests**. A production build with the real public
Sales connection passes. Browser navigation to protected `/dashboard` correctly
redirects to the actual sign-in screen, rather than setup or a fake session.

Read-only hosted REST checks using the modern publishable key verify:

- Anonymous reads of profiles, organizations, quotes, agreements, invoices,
  payment events and allocations return 401.
- The privileged reservation RPC denies anonymous execution.
- An invalid invitation hash returns no organization/customer details.
- Email authentication is enabled. Public signup is now verified disabled; email sign-in remains enabled.

Health advisors returned no findings. Security advisors flag the intentional
checked SECURITY DEFINER API functions; these remain subject to the role gates
tested above. Performance advisors list missing foreign-key indexes, RLS initplan
optimizations and unused fresh-database indexes; these are recorded for tuning,
not represented as completed optimization work. Reference:
https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

Independent-connection booking and owner-ledger contention, signed-in browser
walkthroughs, actual private file upload/download, and reset/invitation email
delivery are still separate connected acceptance checks. No live advertising,
payment collection, email or employee payout was performed.

## Connection configuration

The Sales Vercel project is `krtr-local-sales-app`
(`prj_kWOEHhVROdZbt4uR0bWAPPbAgIhQ`, team
`team_UQveg9jP53fvHVeENIfaBtOo`). Its verified domain is `sales.krtrlocal.tv`.
Production-only public settings were saved:

- `NEXT_PUBLIC_SALES_SUPABASE_URL`
- `NEXT_PUBLIC_SALES_SUPABASE_ANON_KEY` (modern publishable key under the existing name)
- `NEXT_PUBLIC_SALES_SITE_URL=https://sales.krtrlocal.tv`

Preview deployments were not granted production database credentials. Local
public connection values are in ignored `apps/sales/.env.local`; no privileged key
was retrieved or written locally by this setup. Dan configured the Production-only
server key directly in Vercel as a sensitive value. No secret values belong in this document.

Dan completed these dashboard-only steps because the connector does not expose
Auth configuration or privileged API-key retrieval:

1. Disable public signup. Set production Auth Site URL and the approved callback
   URLs listed in `chunk-1-setup.md` (including password-reset variants).
2. Store the Sales secret API key as server-only Production Vercel variable
   `SALES_SUPABASE_SERVICE_ROLE_KEY`, marked secret/sensitive. Do not share it in
   chat or put it in a `NEXT_PUBLIC_*` variable.
3. Sales-only Production deployment is READY at https://sales.krtrlocal.tv.
   Deployment: `dpl_9pEb2cS5xgievzcYjK2dcbc9Jfog`. The first Git redeploy was
   correctly skipped by the unchanged-source filter. The tested Sales source
   snapshot was deployed with a one-build-only `exit 1` ignore override; the
   repository path filters remain unchanged. Its application source matches
   commit `18c540e8793acba9314a918f4b9fe9b9db907863`; the deploy-only config
   override is not a Git commit. No CMS or NRCS deployment was requested.

Live checks: the real sign-in form renders in the browser, signed-out dashboard
and agreement requests redirect to `/login?notice=access` (307), and the expiry
job rejects unauthenticated calls (401). The Production server key is present
as a sensitive variable; its value was not retrieved. Dan's actual password
login and privileged invitation/file workflows still require an authenticated
walkthrough; no password was requested or used by the agent.

SMTP/reset-email delivery and the recurring hold-expiry job remain to be
configured before live customer use, as described in the existing setup notes.
Tax settings remain deliberately unconfigured until Dan supplies their actual
treatment. Main/CMS and NRCS were not modified.
