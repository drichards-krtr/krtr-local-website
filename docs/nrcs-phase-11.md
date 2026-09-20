# NRCS Phase 11 Stabilization

## Mandatory Deployment Gate

**COMPLETE:** The user confirmed on September 20, 2026 that both migrations were applied, both applications were deployed, and the First-Class Dailies acceptance tests passed. Development may resume.

1. Apply `supabase/nrcs/migrations/20260920000200_first_class_dailies.sql` in NRCS Supabase.
2. Apply `supabase/migrations/20260920000300_daily_publication.sql` in CMS Supabase.
3. Commit/push and deploy both applications.
4. Confirm a Draft Daily reaches CMS but remains non-public.
5. Confirm a future Scheduled Daily is hidden before its scheduled instant and appears afterward.
6. Confirm a later eligible Daily on the same date replaces the earlier Daily.
7. Confirm archiving the active Daily removes it from the Homepage with no fallback.
8. Confirm its historical public URL remains available as appropriate for its publication state.
9. Confirm Homepage and Alerts contains no Daily controls.

All nine steps are confirmed.

## Asynchronous Publication Delivery

Status: Implemented; awaiting production deployment and acceptance.

Web Outputs, Homepage lineups, and Priority Alerts now queue an immutable CMS delivery snapshot as part of the save request. After the save response is ready, Next.js `after()` performs the outbound CMS request using the existing signed, idempotent publication contract. The editor no longer performs a separate routine Send action.

The existing delivery table remains the durable outbox. Its unique kind/source/revision identity, immutable package/hash, lease, attempt counter, CMS receipt, and confirmation fields are unchanged. A repeated or uncertain attempt reuses the same request ID. Saving a newer revision creates a new snapshot and cannot mutate an older delivery.

The delivery panel polls while a delivery is pending or sending. It reports received/public state as before. A failed delivery exposes **Retry CMS Delivery**. If content saves but snapshot creation fails, the save remains successful, the response says that queuing failed, and **Queue CMS Delivery** provides recovery. CMS status refresh remains explicit for delivered Web Outputs.

This implementation does not require a cron job, database migration, new environment variable, or CMS deployment. It uses the existing NRCS CMS API URL/secret and CMS publication feature flag. Persistent provider/configuration failures remain visible and require staff retry after correction; the system does not silently loop indefinitely.

## Production Acceptance

1. Deploy NRCS only. Keep current CMS authority/publication flags unchanged.
2. Save a draft Web Output. Confirm the save immediately reports queued, then changes to a CMS receipt without clicking a Send button. Confirm the CMS row remains draft.
3. Save a published Web Output revision. Confirm one delivery record, one CMS projection, preserved CMS identity/URL, and visible public changes.
4. Save the Homepage lineup and a disabled test Alert. Confirm each queues and reaches CMS automatically.
5. Temporarily use an invalid NRCS CMS API base URL only if a controlled failure test is acceptable. Confirm the save succeeds, delivery becomes failed, and retry succeeds after restoring configuration and redeploying. Do not run this test during active Alert or urgent publishing work.
6. Check `/publishing` for clear received/failed states and confirm no routine **Send to CMS** control remains.

## Rollback

Redeploy the prior NRCS version. Existing queued/received delivery snapshots and CMS projections remain valid. The prior manual Send/Retry UI can process any failed or pending snapshot using the same request ID. No database rollback or CMS content reversal is required.

## First-Class Dailies

Dailies are independently managed at `/dailies`; Homepage and Alerts no longer owns Daily selection. Each district-scoped Daily selects one Program Edition, one Cloudinary Hero graphic and one ready Mux video attached to that Edition, a mandatory district-local publication date/time, and Draft/Scheduled/Published/Archived status. The Daily page provides the Cloudinary library plus Mux upload/search controls. Saves use the asynchronous publication outbox.

The CMS stores each Daily as a public presentation projection with a stable NRCS source identity and historical URL. Scheduled and Published Dailies become Homepage-eligible only when their scheduled instant arrives. The Homepage selects the latest eligible Daily for the district and stops showing it at the next local midnight. A later eligible Daily on the same date replaces an earlier one. There is no prior-day or legacy fallback when no NRCS Daily is eligible.

Apply `supabase/nrcs/migrations/20260920000200_first_class_dailies.sql` in NRCS Supabase and `supabase/migrations/20260920000300_daily_publication.sql` in CMS Supabase before deploying either application.

## Prompter Backlog

After the mandatory Daily deployment gate passes, replace the rundown editor's **Script View** action with **Launch Prompter**.

- Open the Prompter in a new browser tab using a standalone route with no NRCS header, sidebar, or application wrapper.
- Render a flat black background with white script text.
- Show a bottom control bar on click or pointer movement and hide it after five seconds of inactivity.
- Controls adjust text size and independently flip the script horizontally and vertically. Keep controls outside the transformed script surface so the controls themselves remain normally oriented.
- `Page Up` and `Page Down` move to the beginning of the previous or next rundown segment. `Home` moves to the top of the script.
- Use smooth programmatic scrolling for segment jumps and smooth CSS scrolling where supported. Do not add automatic scrolling in this slice.
- Persist font size and horizontal/vertical flip settings in browser-local storage and restore them when the Prompter is reopened in that browser.
- The Prompter is read-only and always renders the latest saved rundown version. Draft form state and other in-progress, unsaved editor changes are never included.
