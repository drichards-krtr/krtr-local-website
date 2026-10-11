# Vercel deployment scopes

This is one Git repository with multiple applications. The main website and CMS
live at the repository root; NRCS lives at `apps/nrcs`.

Each application has a `vercel.json` with an Ignored Build Step. Vercel must use
the repository root as the main site's Root Directory and `apps/nrcs` as the
NRCS project's Root Directory. The commands run relative to those directories.

- Main site: builds for changes outside `apps/`; skips changes confined to NRCS,
  calendar ingestion, or future apps such as sales.
- NRCS: builds for changes inside `apps/nrcs` or shared `supabase` files; skips
  main-site-only changes.
- Shared `supabase` changes build both projects.

The commands compare HEAD with `VERCEL_GIT_PREVIOUS_SHA` when available, otherwise
with HEAD's parent. Expose Vercel system environment variables to use the previous
deployment SHA and account for multiple commits between deployments. If the
comparison revision is unavailable (for example, outside the shallow clone), Git
returns a nonzero status and Vercel proceeds with the build. Exit zero means skip;
nonzero means build. Manual deployments may bypass this Git deployment check.

The root `.gitignore` already covers generated files for nested apps. Gitignore
controls Git tracking, not whether a tracked change triggers a Vercel build.

Reference: https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel

## Planned sales application

Future specs will move ad management out of CMS into a sales application at
`sales.krtrlocal.tv`. No migration is implemented yet. If the sales application
is added under `apps/sales`, give its Vercel project its own Root Directory and
deployment scope, and include any shared code dependencies in the affected
projects' build checks.
