# NRCS Phase 10 Authority Cutover Runbook

## Current Gate

Phase 10 is complete. The user confirmed that backups and launch content were ready, both cutover-safety CMS migrations were applied, both applications were deployed, and every activation and production acceptance gate passed.

NRCS is now editorial authority. CMS remains the public presentation projection. CMS legacy editorial access is disabled, CMS NRCS publication is enabled, and the database authority guard remains disabled for legacy writes. Editorial work may proceed in NRCS. Retain this document as the activation and rollback record.

## Original Audit Findings

1. **Legacy write authority is not enforced.** `proxy.ts` and `components/cms/CmsShell.tsx` only redirect/hide legacy pages. `components/cms/StoryEditor.tsx` and `DailyEditor.tsx` write directly to Supabase. Story/slot/calendar/alert server actions and legacy media APIs lack a shared write-authority guard. Existing browser sessions/direct authenticated Supabase calls must be blocked at the database boundary, not merely by hiding links. Keep CMS District Configuration and unrelated CMS operations available; preserve the service receiver and legitimate media readiness callbacks. Reversible enforcement needs explicit design approval before Phase 10.
2. **Legacy Mux upload creation is unauthenticated.** `app/api/mux/create-upload/route.ts` creates a paid Mux upload and then uses CMS service credentials to update a Story/Daily, without checking a CMS user/admin. The `/cms` proxy does not cover `/api/mux/...`. Require authentication, admin access, district-scoped target validation before contacting Mux, authority enforcement, and bounded outbound timeouts. Do not confuse this legacy route with public intake upload or NRCS upload routes.
3. **Imported Event linkage is not used during outbound sync.** The Phase 8 importer retains `nrcs_events.cms_event_id`, but `eventSyncServer.ts` and `cmsSync.ts` send only the NRCS UUID. `receive_nrcs_event` upserts only on `nrcs_source_id`. A legacy CMS Event with no NRCS source linkage can therefore be duplicated on its first NRCS edit. Carry/validate the existing CMS Event ID and attach the NRCS source to that same district-scoped row atomically; reject identity conflicts and retain repeat-send behavior. Test real migration-to-edit round trips, not just receiver-only retries.
4. **Legacy media refresh can resurrect removed video.** The Web adapter replaces playback/asset fields but leaves an old `mux_upload_id` on updates. The public Story renderer calls legacy `syncStoryVideoState` when playback is absent; that helper can recover the old asset and write playback fields back. Make NRCS-owned projections authoritative for media, clear obsolete legacy upload linkage, and prevent legacy refresh/webhooks from changing NRCS-controlled media. Public rendering must not wait on unbounded legacy Mux calls for NRCS content. Audit Daily paths too.
5. **Public metadata/feed still assume Markdown.** NRCS sends SEO title/description, but the Web projection does not persist them for public reads. Story metadata ignores these values; RSS and description fallback read `body_markdown`, which is blank for new NRCS articles or stale for updated legacy articles. Persist/use public SEO fields and derive safe plain text from sanitized HTML for NRCS fallback, keeping legacy Markdown behavior. Verify social share metadata and feed XML escaping.

These paragraphs record the original findings. Their fixes have been deployed and accepted for cutover.

## Implemented Safety Fixes

- CMS `editorial_authority` contains one `legacy_writes_enabled` boolean, default **true**. An invoker trigger blocks non-service/non-maintenance writes to Stories, Events, Dailys, slots, alerts, and Event classification tables when false, including TRUNCATE. Authenticated callers cannot change the switch. It does not change CMS staff roles, District Configuration, public reads, intake, or unrelated CMS features. Installing the migration does not disable writes or rewrite records. CMS legacy server actions and media APIs additionally check both this switch and the existing Vercel page flag, failing closed if configuration cannot load. NRCS service receivers remain permitted; legitimate signed legacy media callbacks remain permitted only for legacy-owned records.
- Legacy Mux upload checks authenticated admin status, authority, exactly one UUID target, district, and legacy ownership before contacting Mux. Final attachment uses the authenticated client, so the database guard covers authority changes during the request. Target filters prevent a late attachment overwriting a newly NRCS-owned row. Provider requests and authority reads have bounded timeouts. Sync APIs validate authority and district too; public intake and NRCS uploads use their separate existing paths.
- NRCS Event sync sends `cms_event_id`. The CMS RPC claims the original same-district CMS row under locks, rejects mismatched source/target/district identities, and retains repeat-send behavior. No bulk Event linkage rewrite or resend is performed during migration.
- NRCS Story/Daily applications clear obsolete legacy upload linkage. Legacy video sync skips NRCS ownership before provider requests and restricts any late patches to legacy rows. Signed CMS webhooks restrict updates to legacy-owned Stories/Dailys. Public NRCS Story rendering never invokes legacy video recovery.
- CMS persists Web SEO fields on projection application. Public metadata uses those fields, and metadata/RSS derive fallback text from sanitized HTML with a structured parser for NRCS content. Legacy Markdown fallback remains intact. `htmlparser2` is explicitly a production dependency rather than relying on an incidental development/transitive install; the existing installed version is used.

## Completed Prerequisites

1. The reversible authority guard and all five audit fixes are implemented on main.
2. CMS migrations `20260920000100_cutover_safety.sql` and `20260920000200_event_projection_identity.sql` are applied.
3. Both applications are deployed with the safety fixes.
4. Phase 9 production acceptance and confirmation checks pass.
5. Backups and the launch-approved content inventory are ready.

Before Stage 1, record the CMS and NRCS production deployment identifiers and the latest CMS and NRCS backup timestamps in the cutover log.

## Activation Order

1. Announce the short editorial freeze; stop all staff publishing/sync actions while flags and database controls are coordinated. Record current configuration. Close legacy editor tabs. Public submissions should remain operational through the established NRCS intake path.
2. Confirm the starting state in **CMS Supabase**:

   ```sql
   select legacy_writes_enabled
   from public.editorial_authority
   where singleton = true;

   select
     to_regprocedure('public.receive_nrcs_event(jsonb)') as event_receiver,
     to_regprocedure('public.receive_nrcs_publication(jsonb,text)') as publication_receiver;
   ```

   Expect exactly one authority row with `legacy_writes_enabled = true` and non-null receiver functions. Confirm CMS Vercel still has `CMS_NRCS_PUBLICATION_ENABLED` absent/false and `CMS_LEGACY_EDITORIAL_ENABLED` absent/true. Stop if any expectation fails.
3. In CMS SQL Editor, disable legacy writes and verify the returned row:

   ```sql
   update public.editorial_authority
   set legacy_writes_enabled = false
   where singleton = true
   returning legacy_writes_enabled;
   ```

   Expect exactly one row containing `false`. Then set `CMS_LEGACY_EDITORIAL_ENABLED=false` on the **CMS Vercel project** and redeploy CMS. Keep `CMS_NRCS_PUBLICATION_ENABLED=false`. Confirm legacy Story/Event/Daily/Alert management routes are unavailable, District Configuration remains available, and public pages and submission intake still work. Stop on any regression.
4. Set `CMS_NRCS_PUBLICATION_ENABLED=true` on the **CMS Vercel project only** and redeploy CMS. Do not set this flag on NRCS. Reconfirm `legacy_writes_enabled=false` after deployment. This flag does not control Event sync, which is already live.
5. Apply one current, launch-approved migrated Story as the Web canary. If its current revision already has a non-public receipt, review and save the Web Output to create a new revision, then send that revision. Confirm the same CMS article ID and public URL are retained, then verify HTML, listing image, carousel, video, tags, SEO/social metadata, feed output, and requested publication state. Stop before any batch on a duplicate, changed URL, missing content, or incorrect media.
   - If an imported image URL survives but its Cloudinary public ID is cleared, stop. Apply the NRCS imported-Cloudinary-identity backfill, deploy the corrected CMS migration export contract, save a new Web revision, and repeat the canary before continuing.
6. Continue approved Web Outputs in small reviewed batches. Do not replay the historical queue. Include deliberate draft/unpublish instructions only where they are part of the launch plan. Check schedules against the district timezone and confirm scheduled content remains hidden until due.
7. Do not mass-resend Events. Event sync is already live. When an imported Event is next edited, confirm that it updates the original CMS UUID without creating a duplicate.
8. Apply the current Homepage lineup only after every referenced Web Output has a valid CMS projection in that district. Review all five slots and the explicit Daily/date/asset before saving and sending a new revision. Empty selections are real clears. Keep historical Daily pages; do not fall back to prior Dailys on the homepage.
9. Review legacy custom alerts so they do not remain unexpectedly active alongside the new alert system. Resolve them through the approved cutover controls. Then apply current launch-approved Priority Alerts after linked Story/Event destinations are ready. Review window, target, and district. New alerts occupy Hero space without changing the saved Hero; weather remains separate.
10. Check the public homepage, migrated URLs/aliases, tag navigation, article media/metadata/feed, calendar list/load-more/filter/popover, Daily expiry, active-alert takeover, and eligible Hero restoration. Use **Check CMS Status** for elapsed Web schedules; Ready-to-Active confirmation is staff-triggered, not a cron transition.
11. Unfreeze editorial work in NRCS only after all relevant acceptance gates pass. Retain legacy code and backups; destructive cleanup belongs to Phase 11, not this switch.

## Post-Cutover Follow-Up

- Add Alert archiving so expired or obsolete Alerts can be removed from the default working view without deleting delivery receipts or publication history.
- Support duplicating a useful archived Alert into a new draft as the template workflow.
- Consider permanent deletion only for never-delivered drafts. Delivered Alerts should remain auditable and must not be hard-deleted through normal editorial controls.
- Replace routine manual publication sends with a reviewed asynchronous transactional-outbox workflow while keeping CMS as the public presentation projection and NRCS as editorial authority.

## Stop and Roll Back

Stop immediately on wrong district, duplicate identity, changed public IDs/paths, failed delivery confirmation, early publication, restored removed media, failed write enforcement, or missing public content.

1. Stop NRCS editorial sends, including Events. Disabling the Web/Homepage/Alert flag alone does not stop the existing Event receiver or public intake.
2. Set `CMS_NRCS_PUBLICATION_ENABLED=false` and redeploy CMS to stop new Web/Homepage/Alert application. Read-only status and already-delivered presentation remain available. Future content already applied as a scheduled row remains eligible when due; this is not a schedule cancellation or content rollback.
3. In CMS SQL Editor, restore legacy writes with `update public.editorial_authority set legacy_writes_enabled=true where singleton=true;`. Set `CMS_LEGACY_EDITORIAL_ENABLED=true` on CMS and redeploy, coordinating both during the freeze. Preserve District Configuration and intake operations. Do not restore the retired reset capability.
4. Retain the current HTML-capable and safety-fixed public renderer/APIs, projections, aliases, and delivery history. Do not roll back to a pre-HTML deployment that can display new articles blank, or a pre-safety deployment that can restore old videos or expose unauthenticated upload. Already delivered content is not automatically reverted by toggling flags.
5. If actual content restoration is required, approve a separately scoped restore using the recorded backup and reconcile submissions/other changes created since it. Never restore both databases wholesale merely to reverse a UI flag. A backup predating the safety migrations lacks required columns/control state: do not restore that schema under the new deployment without a reviewed schema reconciliation plan. Do not assume legacy Markdown editors safely round-trip NRCS HTML during fallback management.
6. Diagnose receipts/errors and verify public routes/media before deciding whether to resume. Keep cleanup and record deletion on hold.

## Rehearsal Evidence

The new `tests/cutover-safety.cjs` covers Mux auth/admin/authority/target denial before paid requests, same-district legacy filters, signed callback ownership filters, NRCS media refresh exclusion, imported Event outbound CMS linkage, SEO precedence, entity-safe structured HTML descriptions, and escaped RSS output. Actual PostgreSQL tests run both new CMS migrations, exercise imported Event first-edit/retry/conflicts, legacy-write disable/re-enable including insert/update/delete/TRUNCATE denial, protected switch permissions, unaffected district writes, service receiver operation while disabled, SEO persistence, and legacy upload clearing. Existing package, import, lifecycle, schedule and renderer regressions are also retained. These isolated fixtures are not production live activation acceptance.
