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

Implemented a CMS-only `CMS_NRCS_PUBLICATION_ENABLED` flag: absent or any value other than exactly `true` keeps publication reception private. Do not enable it yet. Web, Homepage/Daily, and Priority Alert packages now have live adapters behind this flag. Events retain their existing live path.

The additive CMS RPC atomically receives validated packages and applies Web instructions to the existing Story row. Migration `cms_story_id` now travels as optional `cms_article_id`, avoiding duplicate articles if an imported slug was edited. District mismatches, stolen slugs, and incompatible NRCS identities are rejected. Older revisions cannot overwrite newer instructions. Published/scheduled public rows use existing timestamp eligibility filters; future rows are not public early. No scheduled worker is added.

Story presentation distinguishes legacy Markdown from sanitized NRCS HTML, uses explicit ordered article media and primary video, and never treats listing Hero as implicit article media. This rendering is independent of the publishing flag so disabling new writes does not blank already delivered articles. Historical slugs are retained in a district-scoped alias table, resolved through public RLS and redirected to the canonical Story path. Created timestamps are preserved on updates.

Receipt verification now supports confirmed Web draft/scheduled/published/unpublished states, validates article identity/public path, and preserves strict validation of private receipts. The NRCS delivery panel distinguishes those states. Private CMS previews include read-only existing-article resolution and server-time schedule/Daily/Alert eligibility diagnostics.

Taxonomy alias propagation, receipt-to-Story lifecycle confirmation, and scheduled confirmation refresh are implemented. Remaining Phase 9 gates are production acceptance of the confirmation slice, full end-to-end rehearsal review, and an approved activation/rollback checklist. Existing received-private delivery snapshots are not automatically replayed as public writes after activation; controlled activation must explicitly account for them.

## Homepage Daily and Priority Alert Integration

`20260919000200_phase_9_homepage_alerts.sql` adds dormant service-role-only adapters and presentation metadata to existing CMS tables. Homepage applies all five slots and the explicit Daily selection atomically. All selected Web Outputs must first be projected to CMS in the same district; missing dependencies roll back reception and public changes together. Empty slots and a cleared Daily are real clears, not missing instructions.

Daily records retain historical public pages. Homepage selection points to the specific delivered Daily; future/expired/cleared selections never fall back to older Dailys. Publication is district-local midnight, checked against canonical CMS district timezone. Homepage eligibility is evaluated on every uncached server render using the saved district-local publication date, including DST transitions. No cron is required.

Priority Alerts persist headline/body, inclusive start/exclusive end UTC instants, enable state, and Story/Event/external/no target. District alert writes serialize and reject overlapping enabled schedules. Story/Event links resolve CMS identities in the same district and are shown only when the destination is public. Event links open the appropriate calendar week/popover. Alerts never modify saved Hero slots: they occupy the Hero footprint even if no Hero is assigned, and the assigned eligible Hero returns after expiry/disable. Severe weather stays in its existing independent banner; NRCS alerts are excluded from the legacy custom-alert banner. Rollback disables future application but retains already delivered presentation and expiry behavior.

Homepage/Alert receipts use `applied`, not `published`, because applying an instruction does not claim a future/expired Daily/Alert is currently visible. Private receipts remain strictly non-public when the flag is off.

Live receipt URLs use the canonical public subdomain from CMS District Configuration, not the shared API host, so other districts do not receive DLPC links. Invalid/missing district hosts fail before applying publication.

## User Action Required - CMS Supabase for Homepage and Alerts

Where: CMS project > SQL Editor.
Action: Apply `supabase/migrations/20260919000200_phase_9_homepage_alerts.sql` after the Web slice migration and existing district-timezone migration, before deploying this code.
Expected: success; no public content is rewritten or activated by installing the adapters. Return exact error if unsuccessful.
Verify: `select to_regprocedure('public.receive_nrcs_homepage_publication(jsonb,text)'), to_regprocedure('public.receive_nrcs_alert_publication(jsonb,text)');` returns non-null values.
Then user commits/pushes and deploys both apps, keeping `CMS_NRCS_PUBLICATION_ENABLED` absent/false and legacy editorial access enabled. No NRCS SQL, secrets, DNS, cron, or auth configuration change is required for this addition. Verify existing homepage/weather/Daily/calendar and private Homepage/Alert receipts remain unchanged in public behavior.

Local verification: actual PostgreSQL tests exercise Homepage/Daily/Alert retries, missing-dependency rollback, five-slot clears, historical Daily retention, DST midnight, no Hero mutation, overlapping alerts, stale requests, and RPC/anonymous-read permissions. Playwright checks the actual homepage renderer and weather component at 390px/1366px, with normal Hero, Alert+Hero, and Alert+empty-Hero scenarios; managed Daily helper tests exclude expired/cleared fallback. Screenshots were visually inspected. Production live activation is intentionally untested at this point.

## User Action Required - CMS Supabase for Web Slice

Where: CMS project > SQL Editor.
Action: Apply `supabase/migrations/20260919000100_phase_9_web_projection.sql` after Phase 7/8 CMS migrations, before deploying this CMS code.
Expected: success; this adds a service-role-only dormant RPC and public-read slug-alias table, and removes the historical fixed-tag constraint. It does not rewrite public Stories or activate publication. Return exact error if unsuccessful.
Verify: `select to_regprocedure('public.receive_nrcs_web_publication(jsonb,text)'), to_regclass('public.story_slug_aliases');` returns non-null values.

## User Action Required - Rehearsal Deployment

User commits/pushes and deploys BOTH applications after CMS SQL succeeds. Leave `CMS_NRCS_PUBLICATION_ENABLED` absent or explicitly `false`; leave legacy editorial access enabled. Open a private Web receipt in `/cms/nrcs` and verify its new Publication Rehearsal result matches the existing CMS article ID/path. Public content must remain unchanged. No secret, auth, DNS, or cron configuration is needed for this slice.

## Local Verification and Rollback

### Public Taxonomy Compatibility

NRCS Web packages now include URL-safe canonical Tag aliases. Historical immutable packages without aliases remain valid and retain their original hashes. CMS projects canonical slugs and aliases into the existing public filter array, preserving legacy navigation. New canonical Tag pages resolve labels only from district-scoped, currently published CMS projections; draft/future/private taxonomy is not exposed. General text aliases that are not URL slugs remain NRCS-only.

Apply `supabase/migrations/20260919000300_phase_9_public_taxonomy.sql` in **CMS Supabase**, then deploy both apps. No NRCS migration or environment change is needed for this slice. Installing the trigger does not rewrite existing content; alias projection occurs on future Web application. Keep `CMS_NRCS_PUBLICATION_ENABLED` absent/false. The user confirmed production navigation, unchanged public presentation, and private delivery checks passed.

### Web Confirmation and Lifecycle

The authenticated CMS GET `/api/nrcs/publications?request_id=...` reads applied Web presentation without replaying packages or writing public content. It remains available when publishing is disabled: rollback disables new writes, not previously delivered content. Exact district, output, Story, copy version, package hash, and current revision must match before a current public confirmation is reported. Older/private-only deliveries report no current public projection. Scheduled/published status uses CMS time and applied public timestamps, not the browser or NRCS clock.

NRCS stores status checks separately in `nrcs_publication_deliveries.confirmation`; it retains the initial receipt and immutable package/hash. A service-only status RPC ignores out-of-order checks. An atomic trigger moves a Story from Ready to Active only on an actual published confirmation for its current saved Web Output revision and pinned copy. Draft, scheduled, private, superseded, and stale-output confirmations do not activate Stories. Other lifecycle states are not changed. Confirmation never rewrites Web instructions or increments their revision. The system transition preserves the last editorial `updated_by`; normal Story timestamps update through the existing trigger.

Editors/admins can use **Check CMS Status** on received Web deliveries. Requests are asynchronous with bounded timeouts and visible errors/retry. Contributors remain forbidden, and the NRCS API checks accessible district plus RLS visibility before using service credentials. No cron, automatic receipt replay, or background polling is introduced. An elapsed schedule becomes publicly eligible through existing server-side presentation; Ready-to-Active confirmation occurs when staff check CMS status, not automatically at airtime.

### User Actions - Confirmation Slice

1. In **CMS Supabase**, apply `supabase/migrations/20260919000400_phase_9_web_confirmation.sql` after the preceding Phase 9 migrations.
2. In **NRCS Supabase**, apply `supabase/nrcs/migrations/20260919000100_phase_9_web_confirmation.sql` after all existing NRCS migrations.
3. User commits/pushes and deploys both apps. Keep `CMS_NRCS_PUBLICATION_ENABLED` absent/false and legacy access enabled. No environment, secret, DNS, auth, or cron changes are needed.
4. Open a received private Web delivery and click **Check CMS Status**. Expect **CMS received; no current public projection** (or superseded for an older delivery), a last-checked timestamp, no public Story changes, and no Ready-to-Active transition. Repeating the check should succeed without duplicate delivery or content changes.
5. Confirm contributors cannot access CMS delivery controls/API and existing public pages remain unchanged. Do not enable live publishing merely to test scheduled transitions: actual live/scheduled/stale/rollback-read cases are rehearsed in isolated local database fixtures.

Local verification covers actual PostgreSQL schedule refresh with no presentation writes, stale revisions, service-only RPC permission checks, atomic initial and refreshed lifecycle confirmation, immutable original receipts/output revisions, rejected identity mismatches, and out-of-order checks. Delivery contract/transport tests cover read-only GET, canonical district host, redirects, authentication, contributor denial, and separation from sends. Playwright tests the actual delivery component at desktop/mobile widths, checking refresh, visible failure, retry, and overflow; screenshots were inspected.

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
