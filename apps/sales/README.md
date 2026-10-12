# KRTR Local Sales

Independent Next.js app at `sales.krtrlocal.tv`, with its own Supabase project.
Chunk 1 includes setup-aware app shell, email/password sign-in and recovery,
owner administration, district/region/studio/show foundations, and database RLS.
It does not yet enable sales, live payments, customer invitations or fulfillment.

## Local development without a Supabase project

From `apps/sales`:

```powershell
npm ci
npm run dev
```

Open `http://localhost:3002`. With no Sales Supabase variables, all protected
pages redirect to the setup screen. This is not a mock authenticated session;
no customer or financial records are shown. Builds do not require credentials.

```powershell
npm run typecheck
npm test
npm run build
```

With an unconfigured production server running (`npm run start`), run
`npm run test:smoke` in another terminal to check setup redirects.

The tests execute the real foundation migration and PostgreSQL RLS policies
using a disposable in-memory PGlite database with minimal Supabase Auth stubs.
They do not contact or alter any live project. Live Supabase Auth, email delivery,
Vercel and deployed database behavior must still be checked after setup.

See [setup and operating instructions](../../docs/sales/chunk-1-setup.md),
[implementation plan](../../docs/sales/build-plan.md), and
[security boundaries](../../docs/sales/foundation-security.md).
