# Sales Chunk 1 setup

## Status and action timing

The app builds and opens its setup screen without a Sales database. Dan does not
need to create a Supabase project yet for subsequent local implementation work.
A configured project is required to verify real logins, deployed RLS and owner
administration. No Cloudinary, Mux or Stripe interaction is required in Chunk 1.

## Dedicated Supabase project

When ready, create `krtr-sales-production`. Use the same suitable region as
existing KRTR infrastructure when practical; do not reuse the CMS or NRCS project.
Keep the project password outside source control. Only apply migrations from
`apps/sales/supabase/migrations` to this project, in filename order. Do not run
root CMS migrations or NRCS migrations in Sales, or Sales migrations in those apps.
The first migration can be applied through the project's SQL editor; it runs as
one transaction. Apply it once; it is versioned, not a repeated bootstrap script.
For later CLI deployment, maintain a migration history for the dedicated Sales
project and do not accidentally relink the root CMS migration directory.

1. Apply `20261012000100_sales_foundation.sql`.
2. Disable public signup in Supabase Auth. Chunk 2 supplies controlled customer
   organization invitations; customer registration must never create staff access.
3. Create Dan's email/password Auth user using the trusted Supabase admin UI.
4. Verify that user's identity/UUID. Replace the UUID placeholder in
   `apps/sales/supabase/bootstrap-owner.sql` and run it in Sales. This script
   activates Dan and creates the single owner binding. It rejects an unchanged
   placeholder and a missing user. It deliberately refuses to replace an owner.
5. Sign in and confirm Dan sees DLPC, Morning Kickstart and owner settings.

For other verified test staff, create Auth users in the admin UI, then activate
and scope them through Dan's **Staff access** screen. No region names, regional
manager accounts or studios are created automatically. Use test fixtures, not
real customer information, for initial verification.

## Authentication settings

Set the production Auth Site URL to `https://sales.krtrlocal.tv` and allow these
redirect URLs:

- `https://sales.krtrlocal.tv/auth/callback`
- `https://sales.krtrlocal.tv/auth/callback?next=/update-password`
- `http://localhost:3002/auth/callback`
- `http://localhost:3002/auth/callback?next=/update-password`

Add only intentional preview URLs when testing previews. Configure an at-least
12-character password policy and appropriate reset-email rate limits. Email/password
is implemented; no OAuth account setup is needed. Configure Supabase Auth's
custom SMTP with the existing email service when sending to real customers;
use the existing account and a verified sending identity, not a new provider.
Do not assume default Supabase email delivery is production-ready. Verify the
reset email opens the callback, accepts the new password, signs out, and allows
sign-in with the new password. The callback only permits known internal routes.

## Sales environment variables

Copy `apps/sales/.env.example` to `apps/sales/.env.local` for local use, or set
these in the Sales Vercel project with the intended environment scope:

| Variable | Source | Needed now |
| --- | --- | --- |
| `NEXT_PUBLIC_SALES_SUPABASE_URL` | New Sales project's URL | To connect database |
| `NEXT_PUBLIC_SALES_SUPABASE_ANON_KEY` | Sales anonymous/publishable client key | To connect database |
| `NEXT_PUBLIC_SALES_SITE_URL` | `https://sales.krtrlocal.tv`, or local origin | For auth callbacks |
| `SALES_SUPABASE_SERVICE_ROLE_KEY` | Sales server-only privileged key | Reserved; not used in Chunk 1 |

The public key is safe only in conjunction with the shipped database permissions
and RLS. Never put service credentials in `NEXT_PUBLIC_*`, client components,
URLs, screenshots or commits. There is no credential fallback to other apps.
Changes to environment variables require a new deployment to take effect.

## Sales Vercel project

Use the same Git repository, **Root Directory `apps/sales`**, Next.js preset,
Install Command `npm ci`, Build Command `npm run build`, and a compatible Node
version (Node 24 was used locally). Attach `sales.krtrlocal.tv` and complete the
DNS verification Vercel requests. No database variables are required to deploy
the setup screen. Set `NEXT_PUBLIC_SALES_SITE_URL` to the production origin.

The app's `vercel.json` defines its Ignored Build Step. Enable exposure of Vercel
system environment variables so `VERCEL_GIT_PREVIOUS_SHA` can compare with the
previous deployment rather than only HEAD's parent. Missing history produces a
nonzero status and builds safely. First deployment must build; manually deploy
if necessary when establishing a new project's initial baseline.

Verify in Vercel that Sales-only commits skip main and NRCS builds, main-only
commits skip Sales and NRCS, and NRCS-only commits skip Sales and main. Unrelated
files outside `apps/` conservatively build the main site. Sales migration changes
live under `apps/sales`, not the shared root migration directory. Root `supabase`
changes still build main and NRCS, but do not trigger Sales because Sales does
not consume that database. Future shared code must be explicitly added to each
consumer's deployment scope before importing it.

## Deployment verification still needed

- No variables: setup screen loads; `/dashboard` redirects to `/setup`.
- Supplied variables but unavailable/missing database: fail closed, no fake access.
- Signed-out browser: protected pages redirect to login.
- Dan: region creation/rename, district assignment and staff scope changes work.
- Non-owner: owner routes and their server actions cannot change administrative data.
- Customer/production identities: no staff/other-organization access via direct API.
- Deactivate test staff: their access is lost without waiting for JWT role refresh.
- Auth reset and sign-out behave correctly on the production domain.
- Each application deploys only for its relevant changes.

Do not declare first-sale readiness from Chunk 1. Later acceptance includes
Stripe test payments, live integrations and the complete fulfillment scenario.
