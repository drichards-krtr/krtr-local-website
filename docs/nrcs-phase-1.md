# NRCS Phase 1 Foundation

This phase adds the private NRCS shell and staff-access foundation without moving editorial data.
NRCS is a physically separate deployable Next.js application under `apps/nrcs`.

## Local Architecture

- `apps/nrcs/app/login` provides Google OAuth and email/password fallback sign-in against the separate NRCS Supabase project.
- `apps/nrcs/app/(protected)/dashboard` is the protected shell entry.
- `apps/nrcs/app/(protected)/users` is Admin-only user management for invites, role changes, deactivation, and password reset.
- `apps/nrcs/lib/*` contains separate clients and conventions for NRCS Supabase, IDs, tags, and API receipts.
- `supabase/nrcs/migrations` contains migrations for the separate NRCS Supabase project.
- `supabase/nrcs/tests/permission_matrix.sql` contains the Phase 1 RLS permission harness.

## Environment Variables

The CMS/public app continues to use the existing root app environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

The separate NRCS Vercel application uses:

- `NEXT_PUBLIC_NRCS_SUPABASE_URL`
- `NEXT_PUBLIC_NRCS_SUPABASE_ANON_KEY`
- `NRCS_SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_NRCS_SITE_URL`
- `NRCS_CMS_API_SECRET`

## Deployment Boundary

Use two Vercel applications:

- KRTRLocal.TV / CMS: project root `C:\SITES\KRTR`
- NRCS: project root `C:\SITES\KRTR\apps\nrcs`

The applications should have independent environment-variable sets and independent auth middleware/runtime boundaries.

## Phase Boundary

No Event schema, Event migration, Story migration, publication package endpoint, or NRCS editorial object tables are implemented in Phase 1.
