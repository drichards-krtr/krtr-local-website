# Phase 8 - Migration Tooling Preparation

Status: Migration tooling implemented and locally verified; production SQL/deployment and user testing remain pending. No production content was inspected or imported, and no cutover occurred. Local production credentials are deliberately absent.

## Existing Decisions / Boundaries

- Work on main, never create branches, and never commit/push without a request. The user deploys.
- Separate applications and Supabase projects; source export/import communication must use authenticated APIs, not cross-database access from either application.
- Admin-only migration tooling, enforced by server authorization and database permissions, not just navigation.
- Dry Run precedes Import; show counts, mappings, exceptions and validation before any editorial content writes. Imports are explicit admin actions.
- Preserve all district keys, public slug/ID routing, available timestamps, media references and relationships. No legacy PHP routes are needed.
- TipTap-compatible sanitized HTML overrides Markdown as the target Copy model. Preserve original legacy copy privately for comparison; do not invent copy history. Existing single-image Story becomes listing Hero and article image position one.
- Existing repeated Event occurrences become independent Events; preserve recurrence-group provenance, not recurrence behavior. Append individual legacy links to the rich-text body.
- Canonical tags are shared; categories and School Activity Manager terms follow their existing district scope. District configuration remains CMS-owned.
- No automatic publishing, homepage changes, legacy-editor disabling, social-platform publishing, or cleanup in Phase 8.

## Source Inventory

| CMS source | NRCS destination / known gap |
| --- | --- |
| `stories` | Canonical Story, immutable Web Copy, Web Output linked through existing `cms_story_id`; approved lifecycle/status mapping |
| Story `tags` plus district tag configuration | Canonical tags/aliases and Story links; no separate legacy Story category column exists |
| Story image/Mux fields | Shared image or permission-scoped video Assets and Story relationships; preserve video orientation, dimensions, IDs/status; reuse hosted files |
| `story_submitters` and associated Story | Private submission/contact provenance and intake-to-Story link; distinguish retained tips from existing editorial Stories without duplicate conversion |
| `events` and `event_submitters` | Events, private intake/contact provenance; retain existing `nrcs_source_id`/`cms_event_id` identities to avoid reimporting NRCS projections |
| Event classification terms/assignments | District-scoped term mapping; old `is_school_sports=true` without a term cannot identify a particular sport |
| `dailys` | Excluded by explicit user decision |
| `story_slots` | District Homepage Hero/Top Four references resolved to imported Web Outputs |
| `alerts` | Excluded by explicit user decision |
| Existing NRCS content / private Phase 7 projections | Preserve existing work and delivery snapshots; do not treat private receiving projections as new legacy public Stories |

Ads, logos, district configuration, site settings, stream configuration and other CMS-owned operations are not automatically editorial migration targets. Scope must follow the specification's ownership split, including any future Recognition Program work rather than silently migrating its model now.

## Asynchronous / Timestamp Audit

- Current CMS-to-NRCS intake and NRCS-to-CMS Event calls use manual redirect rejection, but lack explicit network timeouts. Account for these old paths before a migration workflow can wait indefinitely.
- Intake conversion and older CMS CRUD still use redirect-based server actions. Keep existing behavior unless a narrow safety change is necessary; migration controls should use bounded asynchronous batches, visible progress/errors and resumable cursors.
- Existing publication delivery already has immutable snapshots, hashes, leases and verified non-public receipts; migration must not bypass or falsely mark those receipts.
- CMS Event times are naive local wall-clock values. Story/Daily editors save ISO instants into legacy timestamp-without-time-zone columns. Timestamp conversion must be field-specific; do not apply one timezone assumption to every column. Invalid/ambiguous dates become exceptions, not guessed values.
- Migration identities and hashes must distinguish unchanged reruns, changed CMS source, changed NRCS target and source deletions. Never silently overwrite local NRCS work or delete it when a source disappears.
- Markdown conversion must report unsupported constructs/URLs and sanitization losses for review rather than claiming an exact conversion. Missing/not-ready media must be visible exceptions, not silently dropped references.

## Approved Mapping Decisions

1. Story states: proposed Draft -> Reporting/Draft; currently public Published -> Active/Published; future Published -> Ready/Scheduled; Archived -> Closed/Unpublished. Retain original state privately. Missing publication dates must be reported without inventing history.
2. Authors: proposed exact email matching to existing NRCS staff, explicit admin mapping for exceptions; unresolved owners remain unassigned with original author provenance retained. Never create auth users or assign the migration operator as the original author automatically.
3. Taxonomy: proposed reuse/create canonical legacy tags with preserved slugs, review collisions/aliases, and leave category unset unless explicitly mapped. Do not infer category from town/school/sports tags.
4. Old sports flag: proposed retain flag provenance, require staff sport mapping for upcoming flagged Events with no classification before cutover, and never infer sport from title. No enabled catch-all sport is silently added.
5. Legacy Dailys are excluded from import by explicit user decision.
6. Legacy alerts are excluded from import by explicit user decision.
7. Delta conflicts: proposed update untouched imported content, create real additional immutable Copy Versions when legacy copy changes, and report any locally edited NRCS target for explicit resolution. Source removals become exceptions, not automatic deletion/unpublish.

## USER ACTION REQUIRED - Deployment

1. CMS Supabase: apply `supabase/migrations/20260918000200_phase_8_migration_export_audit.sql`.
2. NRCS Supabase: apply `supabase/nrcs/migrations/20260918000300_phase_8_migration_tooling.sql`.
3. NRCS Supabase: reapply the updated `supabase/nrcs/migrations/20260918000200_temporary_editorial_reset.sql` so reset also clears migration runs/items/identities. It safely skips those tables when not installed.
4. User commits/pushes main and deploys BOTH Vercel applications. No new environment variables or credentials are required. Existing canonical `NRCS_CMS_API_BASE_URL` and paired API secrets are reused; Mux credentials already installed are used for read-only verification.

Applying these migrations does not delete or import editorial content. Stop and report SQL errors rather than increasing lock/statement timeouts blindly.

## Operator Flow / Validation Gate

- Event migration scope amendment: import only Events whose START date is today or later in the source district's timezone, regardless of draft/published/archived status. This excludes Events that started before today, even if their end date is later. Filtering happens in CMS before counts/pagination/enrichment. Associated past-event submissions are excluded with their Event. Existing NRCS past Events are not deleted, and past prior identities are not reported as missing sources merely because they aged out of scope. Start a fresh Dry Run after deploying the scope change; older staged reports include the previous scope. Import rechecks the scoped source and will not import an Event that aged out after Dry Run.

- Admin sidebar: Migration (`/migrations`). Select one district, Create Dry Run, then Resume Processing. Disabled districts remain selectable for admin migration without enabling public access. The page drives bounded asynchronous batches; Pause finishes the current batch, and closing the page stops new requests. Reopen/select the run and Resume. A lost in-flight lease expires after two minutes. Stop Run abandons future processing without undoing committed imports.
- Dry Run stages private source snapshots/reports ONLY. Scans all configured legacy tags (including unused tags), classification terms, Stories, Events and the Homepage lineup; associated submissions/contact provenance are exported with their editorial object. No editorial/taxonomy/asset inserts happen during Dry Run.
- Compare CMS counts with scanned counts. Audit reports CMS-wide unassigned submissions and unknown district ownership; these require source correction/explicit district assignment before cutover. They are not silently assigned to DLPC.
- Review Copy / Mapping supports explicit existing-user ownership and district classification selections before Import. Upcoming old sports flags require sport assignment. Successful explicit mappings survive in migration identities for later deltas. Unsupported Markdown constructs/URLs, missing dates/media, tag/alias/slug collisions, and local edits are exceptions, not guessed conversions.
- Image validation requests only the trusted Cloudinary host (HEAD, no redirects, bounded timeout); arbitrary source hosts are not fetched. Mux verification uses the existing server credentials and verifies ready asset/playback identity. Rechecks at Import catch changed/deleted media and source records changed since Dry Run.
- Legacy Story authorship cannot establish video upload ownership. Legacy imported videos remain unassigned, with a report warning, so contributors are not granted library access to uploads that cannot be proven theirs. Images remain in the shared pool. Actual hosted media is reused, never re-uploaded.
- Once Ready, choose Import or Delta Sync, type `IMPORT THIS DISTRICT`, authorize, then Resume Processing. Both modes scan complete manifests; Delta is an explicit repeat run with baseline/conflict checks, not an unattended sync subscription.
- Dependencies: tags -> classification terms -> Stories -> Events -> Homepage lineup. Each editorial item, links, identity and result commit in one transaction. Unchanged reruns do not create copies; actual text/headline changes append real immutable versions. Locally edited targets are blocked/reported, never overwritten. Deleted source records are reported and retained in NRCS.
- Homepage is imported as a complete district lineup, preserving existing CMS Story identities and resolving to imported Web Outputs. Missing dependencies block the entire lineup. Nothing is sent to CMS, scheduled for automatic delivery, or made public by this tool; NRCS output states mirror existing source publication intent.
- Completion means processing finished, NOT that every item succeeded. Inspect blocked/conflict/failed/removed statuses, count mismatches, warnings and the CMS-wide audit. Resolve source errors, or review existing NRCS work separately, and run another Dry Run/Delta. Local conflict exceptions require explicit human resolution; this phase does not provide a blanket force-overwrite button.
- Before calling Phase 8 complete: test Dry Run does not create editorial rows, pause/resume, valid Import, identical rerun (no duplicates/versions), actual CMS copy delta (new version), local NRCS edits (conflict), source deletion (retained target), missing media/classification (exception), owner/contributor visibility, and unchanged public CMS content/routes. Excluded Dailys/alerts must not be imported.

## Local Checks

- Both Next production builds passed. CMS emitted expected missing-local-Supabase warnings from existing ad loading; no production environment was added locally.
- `node tests/phase8-api.cjs`: authenticated export pagination, district isolation, Markdown conversion, reciprocal submitter deduplication, API role restrictions, redirect and response identity rejection.
- `node tests/phase8-migration.cjs`: full NRCS SQL chain and CMS audit SQL in local PGlite PostgreSQL, mapping, metadata-only staging, actual imports, retry/idempotency, deltas, local conflict protection, private RLS, rollback on partial import/reset failure, and school-logo preservation/reset bookkeeping.
- PGlite is a temporary test runtime, not a production dependency. To reproduce, install it with `npm install --prefix .tmp/phase8-test --no-package-lock --no-save @electric-sql/pglite`, then run the test; `PGLITE_PATH` can point to another installed runtime.
- Existing Phase 7 and temporary-reset checks pass. Production auth/credentials, live schema drift and Vercel execution still require user verification. Browser workflow testing against production has not been performed locally.
- Dependency audit reports FOUR existing package advisories: baseline-browser-mapping (moderate), browserslist (high), postcss-selector-parser (low), sharp/libheif (high). The added Markdown conversion packages are not implicated. Unrelated dependency updates have not been mixed into this phase.

## Temporary Editorial Reset

- Admin navigation: Temporary Reset (`/maintenance`). Shows counts and requires exact typed confirmation. Server action and authenticated database RPC independently require active admin access.
- Deletes editorial records across all districts, including Sources/document records, general Asset records, intake, follow-ups, Editions/rundowns, Stories/copy/outputs, Events, placements, alerts and delivery records.
- Preserves staff/auth/permissions, districts, taxonomy/activity lists, Programs/templates, school identities/selections/logos, and audit records. Asset entries matching school logo URLs or the `krtr/schools/` namespace are excluded.
- CMS is untouched. Cloudinary, Mux and Supabase Storage physical files are not deleted; document/Asset associations and records are removed. Hosted orphan files may require separately approved cleanup later.
- One database transaction, bounded lock waits, no broad cascading truncation. On database errors, the transaction rolls back; audit entry commits with successful deletion. Avoid editorial activity during reset. Network interruption can obscure a committed result: reload the count preview before retrying.
- FIRST CUTOVER STEP: remove navigation, `/maintenance` page/actions and component, and drop `public.nrcs_temporary_editorial_reset(text)` in NRCS Supabase. Hiding the button alone is insufficient. Verify RPC is unavailable before enabling production ownership.
- Verification after deployment: editor/contributor access denied; incorrect confirmation does nothing; successful reset clears preview counts except protected school assets; school logos, Programs/templates, district/taxonomy/staff survive; CMS content and hosted media remain unchanged.
