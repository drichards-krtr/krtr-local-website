# Chunk 1 verification — October 12, 2026

## Passed locally

- Production build: `npm run build`, Next.js 16.3.3, including TypeScript checks.
- Automated suite: `npm test`, 14 checks passed, zero failures.
- Actual PostgreSQL migration/RLS via PGlite with Supabase Auth stubs:
  anonymous denial, owner administration, scoped district/regional managers,
  cross-district company boundaries, immediate regional reassignment,
  salesperson/production restrictions, customer isolation, inactive identities,
  immutable owner/audit API access, owner activation protection, audit actor,
  invalid staff scope and cross-district studio relationship constraints.
- Deployment tests: disposable committed Git histories verify main/NRCS/Sales
  isolation, Sales-specific migrations, shared CMS/NRCS database changes,
  multi-commit comparisons and unavailable-history build behavior.
- Authentication redirect allowlist and staff scope shape checks.
- Production-server smoke: `/setup` returns 200 with truthful pending state;
  root, protected, login/recovery and callback routes redirect to setup with
  credentials absent. No fabricated authentication or customer records.
- Browser: setup screen opened and its desktop layout was visually inspected.
- `.env.local`, `.next` and `node_modules` are ignored for the Sales app.
- Whitespace check: `git diff --check`.

## Pending external verification

No dedicated Sales Supabase project, migrations, Auth account, email sender,
Vercel project/domain or external integration was provisioned by this work.
Live signup restrictions, reset-email delivery, cookie/session refresh, deployed
RLS and owner dashboard mutations require the dedicated project. Vercel's actual
build skip results require its project Root Directories/environment configuration.
The database tests do not emulate Supabase's full hosted Auth/Data API environment.

The foundation is locally verified; first-sale readiness is not declared.
See `chunk-1-setup.md` for Dan's setup steps and `build-plan.md` for later chunks.
