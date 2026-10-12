# Vercel deployment scopes

This is one Git repository with multiple applications. The main website and CMS
live at the repository root; NRCS lives at `apps/nrcs`.

Each application has a `vercel.json` with an Ignored Build Step. Vercel must use
the repository root as the main site's Root Directory and `apps/nrcs` as the
NRCS project's Root Directory. The commands run relative to those directories.

- Main site: builds for changes outside `apps/` and `docs/`; skips changes confined to NRCS,
  calendar ingestion, Sales, or documentation.
- NRCS: builds for changes inside `apps/nrcs` or shared `supabase` files; skips
  main-site-only changes.
- Sales: Root Directory `apps/sales`; builds only for changes inside that app.
- Shared root `supabase` changes build main and NRCS; Sales uses a separate database
  and keeps its own migrations under `apps/sales/supabase`.

The commands compare HEAD with `VERCEL_GIT_PREVIOUS_SHA` when available, otherwise
with HEAD's parent. Expose Vercel system environment variables to use the previous
deployment SHA and account for multiple commits between deployments. If the
comparison revision is unavailable (for example, outside the shallow clone), Git
returns a nonzero status and Vercel proceeds with the build. Exit zero means skip;
nonzero means build. Manual deployments may bypass this Git deployment check.

The root `.gitignore` already covers generated files for nested apps. Gitignore
controls Git tracking, not whether a tracked change triggers a Vercel build.

Reference: https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel

## Sales application

The Sales foundation exists under `apps/sales`, targeting `sales.krtrlocal.tv`.
Its own `vercel.json` isolates deployments from CMS/main and NRCS changes.
Ad management remains in CMS until the website migration chunk; moving controls
is not part of the foundation. See `docs/sales/build-plan.md` and
`docs/sales/chunk-1-setup.md` for scope and project setup.
