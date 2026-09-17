# Phase 6 - Web Outputs & Homepage Editorial Controls

## Confirmed Decisions

- NRCS controls only; no CMS/public rendering, publishing endpoint, cutover, or legacy UI removal in this phase. Phase 7 adapts CMS.
- TipTap and server-sanitized HTML override the specification's Markdown requirements. Existing Copy editor and immutable version saves remain authoritative.
- One Web Output per Story. New outputs default to latest Web Copy; saved outputs stay pinned to their exact version, including historical versions. New copy never silently replaces the selection.
- Contributors prepare their own drafts only. Editors/admins schedule/publish/unpublish instructions and manage homepage/alerts.
- Daily selects a district Program Edition, finished image/video asset, and local publication date. Assets must be attached to the Edition; existing ready library media can be attached asynchronously from the manager.
- Social destinations: Facebook, Instagram, TikTok, YouTube, X. Planning/manual confirmation only; no direct platform publishing.
- Work on the current branch/main without creating branches. Never push commits; user deploys.

## Asynchronous Check

- Replaced the old redirect-based Web Output save with a dedicated asynchronous Web/Social editor linked from the Story Web Output tab.
- Save/lookup/attachment operations show loading, success, error, and stale-revision states; duplicate saves are locked.
- Database Web Output + article-media replacement is atomic, with serialized Story-specific saves and revision checks.
- Homepage, social, and alerts use compare-and-swap revisions to reject stale edits. Network timeout explicitly leaves completion uncertain and requests reload before retry.
- Search selectors load 25 server rows at a time with debouncing, cancellation, and Load More. Unready media are excluded from Daily selection.
- Unsaved output/alert/lineup edits warn on browser leave and link navigation; switching social outputs/alerts requires confirmation.
- Existing Event save/sync still uses server actions and redirects. This pre-existing behavior is outside the Phase 6 surface and is not changed here.
- Shared CMS district lookup now has an eight-second network timeout and retains its existing local-mirror fallback; a CMS outage cannot leave the new NRCS editorial requests waiting indefinitely.

## Implemented Surface

- `/outputs/<story-id>`: Web and Social editors, historical exact-version selection, optional Hero, ordered article images/graphics, SEO, local schedules, selected-copy/image-carousel preview, manual social publication fields and text copy.
- Existing shared Cloudinary Media Library widget is available directly in Outputs and Daily Edition image attachment. Registration/context attachment is atomic and reuses an existing shared asset reference when available; no duplicate image file is uploaded by NRCS registration.
- `/homepage?district=<key>`: Daily, persistent Hero, ordered Top Four, shared image/district-video attachment, and Priority Alerts.
- Story/Event contextual Create Priority Alert links; new Homepage & Alerts sidebar entry for editors/admins.
- Priority Alerts support optional start/end, standalone or Story/Event/external/no link, yellow/black NRCS preview, and database conflict rejection for overlapping enabled schedules. Alerts never modify the saved Hero assignment.
- Pure eligibility helpers evaluate Daily by district-local calendar date and alerts by inclusive start/exclusive end. Public integration must evaluate eligibility at presentation time (including caching strategy), not rely on midnight cron.
- Publication states in this phase are NRCS instructions, not CMS delivery receipts. Saving published/scheduled Web instructions does not schedule an external worker, activate the Story, or expose it publicly. Those transitions require actual downstream confirmation in later integration.
- Social Published is an explicit manual confirmation of actual publication; its first transition atomically activates a Ready Story. Other lifecycle states are not changed automatically.

## USER ACTION REQUIRED - NRCS Supabase

Where: Supabase Dashboard > NRCS project > SQL Editor > New query.
Action: Apply `supabase/nrcs/migrations/20260917000100_phase_6_outputs_homepage.sql` after Phase 1-5 migrations.
First: Run read-only `supabase/nrcs/tests/phase6_outputs_preflight.sql` and review counts/exceptions. If either duplicate exception query returns rows, stop and return the rows to Codex before applying the migration; do not delete records. The last query is informational about older instructions needing correction before saving.
Value: Complete SQL file. Do not run in CMS.
Return: Confirm success, or exact SQL error; never return secrets.
Verify: `nrcs_web_output_media`, `nrcs_social_outputs`, `nrcs_homepage_lineups`, `nrcs_priority_alerts` exist; Web Outputs have district/revision columns.
Safety: Transactional additive migration. Stops if a Story already has multiple Web Outputs or if district slugs conflict; no duplicate records are deleted. Resolve any reported exceptions before retrying. Existing records are not forced through new publication validation until edited.
Optional verification: `supabase/nrcs/tests/phase6_outputs_permissions.sql` provides rollback-only contributor/editor, stale-save, atomic-media, exact-version, and alert-conflict checks. Codex has not run it against Supabase.

## Local Verification

- TypeScript and final NRCS production build passed.
- `node tests/phase6-outputs.mjs --unit`: model, midnight/DST eligibility, ready-video checks, and mocked API authorization/date/revision boundaries passed.
- Browser fixture checks render the actual React components with mocked APIs in Edge; asynchronous saves, media ordering/carousel/close, failure states, contributor status options, and 1440/390px layouts passed. They are not a live auth/database integration test.
- No local database or production credentials were used. SQL/RLS and authenticated production flows still require Supabase/deployment verification.

## USER ACTION REQUIRED - Deployment

Where: User Git workflow > push main > NRCS Vercel production deployment.
Action: Commit/push the application changes after the SQL succeeds, then deploy NRCS.
Value: Current main changes. No new secrets, environment variables, DNS, Cloudinary presets, Mux settings, or CMS migration required.
Return: Confirm deployment and production checks, or exact errors.
Verify: Story > Web Output > Edit Web & Social Outputs and sidebar > Homepage & Alerts load.

## Production Checks

1. New Web Output defaults to latest copy. Save older copy, create newer copy, reopen and confirm pin persists.
2. Draft without Hero/media saves; scheduled/published requires correct copy, slug, and relevant time. Times round-trip in district timezone, not browser timezone.
3. Hero is used as listing image, but is not automatically included in article media. If included, it stays first. Reorder other images and inspect the NRCS carousel preview.
4. Save shows success without full-page navigation. Duplicate clicks do not duplicate rows. Two open editors reject the second stale save; invalid media rolls back the entire Web save.
5. Contributor cannot publish/schedule/unpublish, edit another Story output, manage homepage/alerts, or change a non-draft output through direct API/SQL requests.
6. Each social destination saves draft/schedule/manual published confirmation with exact Social Copy and optional ready media/URL. Copy Selected Social Text copies readable text.
7. Per-district Hero/Top Four selection/order persists. Daily selects an Edition plus ready attached media/date; attach existing media works without losing Segment association.
8. Daily is eligible only on its publication date in district timezone, including local midnight/DST boundaries. This phase does not change public rendering.
9. Alert without link/Story/Hero saves. Story/Event target must be published and from this district. External target accepts only HTTP(S).
10. Overlapping enabled alerts fail clearly; adjacent non-overlapping schedules work. Disabling the conflicting alert permits replacement. Yellow preview starts/ends automatically while open.
11. Alert saves never overwrite Hero, including Hero changes while an alert is active. Severe weather/CMS/public site remain unchanged.
12. School/graphics/Event/Story/rundown workflows continue to work.

## Rollback

Redeploy the known-good NRCS Vercel deployment. Keep additive tables and editorial records; no data deletion or CMS rollback is required. Retain the tightened contributor publication restrictions. The old Web Output UI may receive a database permission error if a contributor attempts a non-draft save.
