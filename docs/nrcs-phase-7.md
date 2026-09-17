# Phase 7 - CMS Additive Adaptation

## Confirmed Decisions

- CMS permissions and email/password login remain unchanged. The specification's CMS OAuth/user-management expansion is overridden by the user's decision.
- Work on main; no new branches, commits, or pushes by Codex.
- TipTap sanitized HTML remains authoritative. Existing public Markdown, URLs, CMS editors, and public queries are unchanged.
- Web Outputs gain optional tease and primary ready Mux video attached to the Story. Social Outputs already accept video and remain manually published.
- Web Hero selection uses the full Cloudinary Media Library widget, attaches/reuses the selected shared asset, and provides a preview and clear control. Save Web Output persists the assignment; article inclusion remains explicit.
- Delivery loads the pinned Copy Version's `stream_id` separately and verifies its Story/Web stream, avoiding the ambiguous reciprocal current-version relationship.
- Explicit asynchronous Send to CMS / Retry stores an immutable package and validates a non-public receipt. Saving alone does not send or publish.
- Web, Homepage/Daily, and Priority Alert instructions are received into private CMS projections. Even a requested Published status is NOT public publication in this phase. Receipt article ID, public URL, and actual publication timestamp remain null.
- Stable Story/output/copy IDs, district, canonical category/tags, ordered images, separate listing Hero, video, schedules, and SEO travel through an explicit whitelist. Internal notes, facts, source documents, and private assets never travel.
- Existing Event sync remains live; its Event/classification writes are now one atomic database transaction with the existing receipt shape.

## Asynchronous / Safety Audit

- Output/lineup/alert delivery uses fetch, loading/failure/confirmed states, locked double clicks, bounded network waits, and canonical-host-only transport. Redirects are not followed with credentials.
- Retries reuse the original request UUID, snapshot, and hash, including after a timeout. CMS rejects reused keys with changed content and rejects new stale revisions. Leased attempts prevent simultaneous resend; abandoned attempts can be retried after 60 seconds.
- CMS receipt identity, district, revision, hash, projection ID, and non-public state are checked before confirmation. A receipt for an older delivered revision also reports the current projection revision.
- `/publishing` lists delivery status with district/status filters and retry controls. `/cms/nrcs` lists admin-only received packages; its preview renders sanitized HTML, carousel images and Mux video.
- `CMS_LEGACY_EDITORIAL_ENABLED` defaults to enabled when absent. Setting exactly `false` hides and blocks legacy Story/Calendar/Daily/Alert pages, retaining all code. DO NOT disable it during this phase. It is a future UI rollback switch, not a publishing-authority switch; legacy server actions are not removed.
- CMS staging tables deny anonymous reads and ordinary writes. NRCS delivery snapshots deny contributor reads and ordinary writes. Only server service roles receive/claim/write delivery records.
- No automatic workers, social-platform API, migration import, public rendering switch, or cutover is enabled here.

## USER ACTION REQUIRED - CMS Supabase

Location: Supabase Dashboard > existing CMS project > SQL Editor > New query.
Action: Apply `supabase/migrations/20260918000100_phase_7_nrcs_receiving.sql` after the existing Phase 1-6 CMS migrations.
Value: Complete SQL file, in CMS only. Transactional/additive; does not rewrite public content.
Migration-local guards limit each lock wait to five seconds and the annotated migration block to 45 seconds. Database errors identify the numbered SQL operation that failed. These do not raise the dashboard timeout or change application settings. If a run times out, check active sessions and object existence before retrying; do not assume an upstream timeout means rollback. Return the full database error rather than repeatedly running the migration or terminating unrelated sessions.
Return: Confirm success or exact SQL error; do not send credentials.
Verify: `nrcs_publication_projections`, `nrcs_publication_receipts`, `receive_nrcs_publication`, and `receive_nrcs_event` exist. Existing public stories/events still load.

## USER ACTION REQUIRED - NRCS Supabase

Location: Supabase Dashboard > NRCS project > SQL Editor > New query.
Action: Apply `supabase/nrcs/migrations/20260918000100_phase_7_delivery.sql` after Phase 6.
Value: Complete SQL file, in NRCS only.
Return: Confirm success or exact SQL error; do not send credentials.
Verify: Web Outputs have `tease` and `video_asset_id`; `nrcs_publication_deliveries` exists.

Optional rollback-only checks: run `supabase/tests/phase7_receiving.sql` in CMS and `supabase/nrcs/tests/phase7_delivery.sql` in NRCS. They exercise non-public receipts, idempotency/stale revisions and immutable leased delivery records, then roll back. Codex has not run these against Supabase.

## USER ACTION REQUIRED - Deployment / Configuration

Location: Git repository and BOTH independent Vercel applications.
Action: User commits/pushes/deploys these changes after applying both migrations. CMS must have the new receiving deployment before NRCS delivery is tested.
Expected existing values: CMS `CMS_NRCS_API_SECRET` exactly matches NRCS `NRCS_CMS_API_SECRET`. NRCS `NRCS_CMS_API_BASE_URL` remains the canonical CMS origin (`https://www.krtrlocal.tv`), without `/cms` or `/api`. Service-role keys remain separate server-only Vercel variables.
New environment variables required: None. Leave `CMS_LEGACY_EDITORIAL_ENABLED` absent or `true`.
Return: Deployment/test results only. No secret values required.
Verify: both projects Ready, public site unchanged, NRCS editor pages and CMS NRCS Receipts accessible to their existing authorized staff.
Other actions: None for Google OAuth, DNS, Cloudinary, Mux, or account settings.

## Production Acceptance Checklist

1. Save Web Output tease/video and reopen: exact copy version, status, tease, video and media order persist. Processing video is visible but cannot be selected. Social video still works.
2. Send Draft/Scheduled/Published/Unpublished instructions. Confirm NRCS says **CMS received (non-public)** and CMS Receipts shows the matching district/source/revision. Public stories must NOT change.
3. Preview HTML headings, paragraphs, blockquotes, lists, links, ordered images, video and SEO. Hero remains separate from the article carousel unless explicitly included.
4. Send Homepage/Daily and enabled/disabled Priority Alert. Confirm private previews/IDs; no live homepage, weather bar or alert changes.
5. Double-click/send again and retry after a failed/uncertain attempt: one projection, same request receipt, no duplicate public content. Save a new revision and send it; an older undelivered revision cannot overwrite it.
6. Contributors cannot send or read the delivery queue; anonymous clients cannot read either staging table. Existing CMS admin checks remain unchanged.
7. Create/update Event Draft/Published/Archived with sport/activity/type and description. Existing CMS receipt/public behavior must still work.
8. Public homepage, Story URLs, town/category links, Daily, alerts, calendar pagination/popover, and legacy CMS edits remain functional.

## Rollback

Redeploy known-good CMS and NRCS versions; keep additive migrations/tables and stored receipts. Leave legacy editorial flag enabled. No public publication switch is changed in Phase 7. Do not delete tables or content to roll back.

## Local Verification

Both production builds and TypeScript checks passed. `node tests/phase7-publications.cjs` checks package validation, sanitization, API permissions, receipts, redirect/timeout failures and frozen retries. NRCS `node tests/phase6-outputs.mjs --unit` and the desktop/mobile browser suite passed, covering saves, video selection, tease, failed-send/retry and non-public confirmation. CMS build logs expected missing-local-Supabase warnings; no local credentials were added. Live Supabase/RLS/transaction and production-media checks remain user verification; Codex does not execute production SQL.
