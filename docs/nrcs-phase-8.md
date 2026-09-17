# Phase 8 - Migration Tooling Preparation

Status: Repository/specification audit complete; mapping decisions approved. Temporary editorial reset implemented, pending NRCS SQL application and deployment. Migration tooling/import and cutover are not implemented. Live counts/schema drift have not been inspected because local production credentials are deliberately absent.

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
| `stories` | Canonical Story, immutable Web Copy, Web Output linked through existing `cms_story_id`; lifecycle/status mapping needs approval |
| Story `tags` plus district tag configuration | Canonical tags/aliases and Story links; no separate legacy Story category column exists |
| Story image/Mux fields | Shared image or permission-scoped video Assets and Story relationships; preserve video orientation, dimensions, IDs/status; reuse hosted files |
| `story_submitters` and associated Story | Private submission/contact provenance and intake-to-Story link; distinguish retained tips from existing editorial Stories without duplicate conversion |
| `events` and `event_submitters` | Events, private intake/contact provenance; retain existing `nrcs_source_id`/`cms_event_id` identities to avoid reimporting NRCS projections |
| Event classification terms/assignments | District-scoped term mapping; old `is_school_sports=true` without a term cannot identify a particular sport |
| `dailys` | Program Edition and finished media references; legacy records have no Program association or independently recorded air time |
| `story_slots` | District Homepage Hero/Top Four references resolved to imported Web Outputs |
| `alerts` | Priority Alert; legacy record has message/link/schedule/enabled state but no headline |
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

## USER ACTION REQUIRED - Preparation

Apply `supabase/nrcs/migrations/20260918000200_temporary_editorial_reset.sql` in NRCS Supabase only, then commit/push/deploy. Applying this SQL installs a capability; it does not delete content.

## Temporary Editorial Reset

- Admin navigation: Temporary Reset (`/maintenance`). Shows counts and requires exact typed confirmation. Server action and authenticated database RPC independently require active admin access.
- Deletes editorial records across all districts, including Sources/document records, general Asset records, intake, follow-ups, Editions/rundowns, Stories/copy/outputs, Events, placements, alerts and delivery records.
- Preserves staff/auth/permissions, districts, taxonomy/activity lists, Programs/templates, school identities/selections/logos, and audit records. Asset entries matching school logo URLs or the `krtr/schools/` namespace are excluded.
- CMS is untouched. Cloudinary, Mux and Supabase Storage physical files are not deleted; document/Asset associations and records are removed. Hosted orphan files may require separately approved cleanup later.
- One database transaction, bounded lock waits, no broad cascading truncation. On database errors, the transaction rolls back; audit entry commits with successful deletion. Avoid editorial activity during reset. Network interruption can obscure a committed result: reload the count preview before retrying.
- FIRST CUTOVER STEP: remove navigation, `/maintenance` page/actions and component, and drop `public.nrcs_temporary_editorial_reset(text)` in NRCS Supabase. Hiding the button alone is insufficient. Verify RPC is unavailable before enabling production ownership.
- Verification after deployment: editor/contributor access denied; incorrect confirmation does nothing; successful reset clears preview counts except protected school assets; school logos, Programs/templates, district/taxonomy/staff survive; CMS content and hosted media remain unchanged.
