# Phase 9 - Integration and Rehearsal Preparation

## Status and Boundaries

The user verified Phase 8 dry-run and import in production. CMS editorial changes are frozen pending cutover. Delta/conflict cases have local regression coverage, not production acceptance coverage; artificial live edits are not required.

Phase 9 is integration/rehearsal, not the Phase 10 authority switch. Work remains on main, without agent commits/pushes. Separate Vercel applications, credentials, auth boundaries, and API-only communication remain mandatory. TipTap sanitized HTML and district awareness override original specification omissions.

## First Safety Step

Removed the NRCS Temporary Reset navigation, maintenance page, server action, and submit component. Apply `supabase/nrcs/migrations/20260918000600_retire_editorial_reset.sql` in NRCS only to retire the database RPC. This drops a capability, not editorial records. Keep historical migrations/tests; do not restore this function during rollback.

## Integration Gaps

- Web/Homepage/Alert delivery currently writes private CMS projections and validates non-public receipts. It does not create/update public articles, execute schedules, or return actual publication receipts.
- Existing Event synchronization is already live. Integration must retain this behavior and avoid pretending all publication types currently share the private boundary.
- Public presentation remains legacy CMS-driven. HTML/article carousel, listing Hero, primary video, taxonomy links, district routing, and preserved public IDs/slugs need end-to-end integration verification.
- Daily district-local expiry and Priority Alert replacement of Hero (including an empty Hero slot) need presentation-time eligibility and cache verification. Severe-weather display stays independent.
- The legacy editorial feature flag only hides/blocks legacy pages; it is not a publishing-authority or full write-enforcement switch. Retain legacy code and specify rollback before activating production publishing.
- Phase 9 specifies staging, but the user cannot use branch-preview auth URLs and does not keep local production credentials. An explicitly approved production-domain rehearsal boundary is needed before public writes.

## Decisions Required Before Public Integration

All four decisions below were confirmed by the user. No additional decision is required for the first Web integration slice.

1. Approve building the live CMS adapter behind a default-off publishing flag, keeping current private receipts/public rendering unchanged until explicit activation. Rehearse in isolated local database fixtures and production private previews, since branch staging is unavailable.
2. Confirm legacy CMS public Story/Event tables should remain the presentation projection, preserving public IDs/slugs and existing URLs; NRCS is editorial authority after Phase 10. Extend presentation fields for sanitized HTML and ordered media, rather than introducing a second public content store.
3. Choose scheduled delivery operation. Recommendation: persist authenticated packages in CMS, evaluate due publication/expiry at server read time with bounded cache lifetime, and require explicit delivery of revised NRCS instructions. This must be designed/tested before activation; no undocumented cron or Vercel-plan assumptions.
4. Confirm rollback restores legacy UI and disables new publication application while preserving already delivered public content. Content rollback requires a separate snapshot/restore plan; UI rollback alone does not undo content changes.

## First Web Integration Slice

Implemented a CMS-only `CMS_NRCS_PUBLICATION_ENABLED` flag: absent or any value other than exactly `true` keeps publication reception private. Do not enable it yet. Web packages alone have the live adapter in this slice; Homepage/Alerts still receive private receipts. Events retain their existing live path.

The additive CMS RPC atomically receives validated packages and applies Web instructions to the existing Story row. Migration `cms_story_id` now travels as optional `cms_article_id`, avoiding duplicate articles if an imported slug was edited. District mismatches, stolen slugs, and incompatible NRCS identities are rejected. Older revisions cannot overwrite newer instructions. Published/scheduled public rows use existing timestamp eligibility filters; future rows are not public early. No scheduled worker is added.

Story presentation distinguishes legacy Markdown from sanitized NRCS HTML, uses explicit ordered article media and primary video, and never treats listing Hero as implicit article media. This rendering is independent of the publishing flag so disabling new writes does not blank already delivered articles. Historical slugs are retained in a district-scoped alias table, resolved through public RLS and redirected to the canonical Story path. Created timestamps are preserved on updates.

Receipt verification now supports confirmed Web draft/scheduled/published/unpublished states, validates article identity/public path, and preserves strict validation of private receipts. The NRCS delivery panel distinguishes those states. Private CMS previews include read-only existing-article resolution and server-time schedule/Daily/Alert eligibility diagnostics.

This does not complete Phase 9. Remaining work: Homepage/Daily/Alert live adapters and rendering, taxonomy alias propagation/public filters, receipt-to-Story lifecycle confirmation, scheduled confirmation refresh, complete permission/failure/browser rehearsal, and activation/rollback checklist. Existing received-private delivery snapshots are not automatically replayed as public writes after activation; controlled activation must explicitly account for them.

## User Action Required - CMS Supabase for Web Slice

Where: CMS project > SQL Editor.
Action: Apply `supabase/migrations/20260919000100_phase_9_web_projection.sql` after Phase 7/8 CMS migrations, before deploying this CMS code.
Expected: success; this adds a service-role-only dormant RPC and public-read slug-alias table, and removes the historical fixed-tag constraint. It does not rewrite public Stories or activate publication. Return exact error if unsuccessful.
Verify: `select to_regprocedure('public.receive_nrcs_web_publication(jsonb,text)'), to_regclass('public.story_slug_aliases');` returns non-null values.

## User Action Required - Rehearsal Deployment

User commits/pushes and deploys BOTH applications after CMS SQL succeeds. Leave `CMS_NRCS_PUBLICATION_ENABLED` absent or explicitly `false`; leave legacy editorial access enabled. Open a private Web receipt in `/cms/nrcs` and verify its new Publication Rehearsal result matches the existing CMS article ID/path. Public content must remain unchanged. No secret, auth, DNS, or cron configuration is needed for this slice.

## Local Verification and Rollback

Local tests cover schedule boundaries, district-local Daily midnight, inclusive Alert starts/exclusive ends, ambiguous/stolen article identities, actual PostgreSQL RPC ID preservation/retries/stale revisions/unpublish/permissions, and private receipt regression. Keep the public flag off. For rollback, disable that flag and re-enable legacy editorial UI; retain projection data, aliases, and HTML-capable presentation. Redeploying a pre-HTML renderer after live activation can make newly delivered HTML-only articles appear blank and is not a safe content rollback.

## User Action Required - NRCS Supabase

Where: NRCS project > SQL Editor.
Action: Run the complete retirement migration once (safe to rerun).
Value: `supabase/nrcs/migrations/20260918000600_retire_editorial_reset.sql`.
Return: Confirm success or exact error, without credentials.
Verify: `select to_regprocedure('public.nrcs_temporary_editorial_reset(text)');` returns null.

## User Action Required - Deployment

Where: Repository main and NRCS Vercel project.
Action: User commits/pushes and deploys NRCS after SQL succeeds.
Verify: Temporary Reset absent from navigation; `/maintenance` returns the normal not-found page; existing NRCS content is intact. No CMS deployment, new environment variable, DNS, or auth change is needed for this preparation step. Do not disable legacy CMS editorial access or enable production publishing yet.
