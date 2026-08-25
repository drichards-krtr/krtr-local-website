# NRCS Phase 1 Foundation

This phase adds the private NRCS shell and staff-access foundation without moving editorial data.
NRCS is a physically separate deployable Next.js application under `apps/nrcs`.

## Local Architecture

- `apps/nrcs/app/login` provides Google OAuth and email/password fallback sign-in against the separate NRCS Supabase project.
- `apps/nrcs/app/(protected)/dashboard` is the protected shell entry.
- `apps/nrcs/app/(protected)/users` is Admin-only user management for invites, role changes, deactivation, and password reset.
- `apps/nrcs/lib/*` contains separate clients and conventions for NRCS Supabase, IDs, tags, district context, and API receipts.
- `supabase/nrcs/migrations` contains migrations for the separate NRCS Supabase project.
- `supabase/nrcs/tests/permission_matrix.sql` contains the Phase 1 RLS permission harness.
- `app/cms/(protected)/districts` is the CMS-owned district configuration page.

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

## District Ownership

District configuration is owned by the CMS/public Supabase project in `public.districts`.
CMS can create, edit, enable, and disable districts. CMS must not expose a delete workflow for districts.

Each district row has a Supabase-assigned UUID, but application behavior uses the stable `district_key`.
Current CMS keys are preserved as lowercase values:

- `dlpc`
- `vs`
- `bc`

The NRCS Supabase project keeps `public.nrcs_districts` as a local read/permission model of CMS-owned districts.
NRCS can use district records and display primary contact information, but district configuration remains CMS-owned.

Users are global/shared records, not district-owned records. NRCS district access is represented by
`public.nrcs_staff_districts`, and district-scoped editorial objects must use `district_key` plus shared RLS helpers
such as `public.nrcs_can_access_district(district_key)`.

District-scoped objects in later phases include Stories, Events, Tips/Submissions, Program Editions/Rundowns,
Homepage editorial placements, Priority Alerts, and future Recognition Program records.
Shared objects such as Users, canonical Tags, Sources, and general Assets should not be forced into district ownership
unless their actual model requires it.

The initial NRCS UI may default to DLPC, but DLPC is only a default selection, not a schema assumption.

## Phase Boundary

No Event schema, Event migration, Story migration, publication package endpoint, or NRCS editorial object tables are implemented in Phase 1.
