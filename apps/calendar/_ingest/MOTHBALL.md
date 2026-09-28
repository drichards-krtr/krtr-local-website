# NRCS Calendar Ingestion Pipeline — on hold

Recorded **2026-09-27**, at the user's request. “Event Eater” is the informal name. This is the restart handoff, not a declaration that the full engineering specification is complete.

## September 28 update — navigation hidden and work stashed

- The checkout is now on `main` (HEAD `95b318c` when inspected). Phase B is not present in this working tree; it is preserved in the GitHub Desktop stash labeled `On codex/calendar-ingestion-phase-b: !!GitHub_Desktop<codex/calendar-ingestion-phase-b>` (then `stash@{0}`). Its index snapshot `efacb30` contains this handoff and Phase B files. Stash numbers can change: identify it by message/content before recovery. A local stash is not a pushed branch or remote backup.
- This document was recovered by itself from that snapshot. The stash was not applied, popped, or deleted. The September 27 state below is historical, not the current checkout state. Phase B links/files may be unavailable until that saved work is restored.
- Removed **Calendar Intake** (`/calendar-intake`) and **Calendar Sources** (`/calendar-sources`) from the shared NRCS main navigation in `apps/nrcs/components/NrcsShell.tsx`. Normal Events and general Intake remain available.
- This is navigation removal only: existing routes, permissions, API endpoints, and data are retained. Direct URLs still work subject to their existing access checks. No deployments, Make schedules, or sources were disabled by this change.
- At spin-up, inspect and safely recover the saved Phase B work on its intended branch after preserving any newer edits. Reconcile this updated document with the older stashed copy. Restore the two navigation entries in `NrcsShell.tsx`, each with `minimumRole: "editor"`, when the feature is ready for staff again. Deploy NRCS for navigation changes to take effect.
- Verification for this update: inspected the shared navigation and checked the diff; no new runtime tests were needed for deleting two static links. Earlier implementation test results below remain historical.

## State at the September 27 pause

- Working directory: `C:\SITES\KRTR`; ingestion service: `apps/calendar/_ingest`; editorial application: `apps/nrcs`.
- Current branch: `codex/calendar-ingestion-phase-b`. HEAD: `a6bd1cc` (`Event Eater Initial Commit`).
- **Phase B is still uncommitted**, including untracked implementation files, tests, migration, and deployment documentation. The branch name/HEAD alone does not preserve that work. Preserve the entire working tree, including untracked files; do not discard changes or assume a fresh checkout contains Phase B.
- Phase A foundation is implemented. The user reported a successful live Make submission, approval to draft, and saving that draft after resolving setup errors.
- Phase B structured-feed execution is implemented and locally tested; deployment and live acceptance are **not confirmed**. No later deployment confirmation was received before this pause.
- The overall pipeline is incomplete. The next milestone is deploying and accepting Phase B, not building the structured adapters again.
- No deployment, database, Make schedule, source enablement, or secret setting was changed as part of mothballing. Live service/schedule state was not inspected. “On hold” here records project status; it does not disable infrastructure.

## Requirements that must survive the pause

User decisions override conflicting instructions in the original specification. Read [recorded decisions](../../../docs/calendar-ingestion-decisions.md) before continuing.

- Approval means **keep for review/polishing**, creating a draft; it never means publish.
- Manual and ingested Events share the same publication validation. Required publication fields are optional for drafts. Do not invent missing facts or a time for date-only/time-TBD findings.
- Confirmed cancelled Events must eventually remain public with a Cancelled flag. Source disappearance is not confirmation. The public cancellation behavior is still pending.
- Restoring any archived Event always requires human approval. A reappearing source must never restore one automatically.
- The scan horizon is 90 days. Sources remain configurable through NRCS: add, edit, enable, disable.
- Ingestion has its own Vercel project rooted at `apps/calendar/_ingest`. NRCS owns the database, source registry, review, and canonical Events. The public CMS receives changes only through NRCS publication. Make is the intended scheduler.

## Work completed

### Phase A — foundation and draft workflow

- Independent ingestion app, health endpoint, authenticated normalized-payload relay (`POST /api/runs`).
- NRCS source registry, seven editable seed records (initially disabled), recent run history, Calendar Intake, review/audit fields, stable occurrence identities, replay protection, and unchanged-finding suppression.
- Dedicated integration credential and CMS-authoritative enabled-district checks.
- Approval of a new candidate creates an incomplete draft. Existing-event proposals stay staged, with no automatic overwrite or restoration. Rejection suppression and 90-day purge eligibility are recorded.
- Shared draft/publication validation and CMS visibility-only synchronization for drafts/archived Events; unpublished drafts do not create public CMS records.

### Phase B — implemented locally; awaiting deployment acceptance

- iCalendar adapters for Dysart Localendar and LPC Chamber's public Google Calendar; RSS adapter with a **Concrete CMS calendar profile** for Norma Anders Public Library. This additional profile is necessary because that feed's pubDate represents the event occurrence; generic RSS must not assume this.
- Recurrence/exclusions/individual exceptions, district-local time conversion, original date/time evidence, and incomplete handling for date-only, unknown-zone, or ambiguous DST times.
- Authenticated `POST /api/scan` and `GET /api/sources`; NRCS Run Now/Retry controls and source profile/timezone configuration.
- NRCS-owned scan jobs, per-source two-minute leases, staged payloads, identical-payload retries, and completed receipts.
- Public-address validation and pinned DNS for feed requests; redirect, time, body, candidate-count, and expansion limits. Challenges/fetch errors are failures, not empty inventories.
- Source evidence shown in intake and after draft approval. CANCELLED is evidence for human review, not an automatic canonical status change.

## Testing performed and its limits

These are results from the last implementation session, not fresh runs on the pause date. Mothballing changed documentation only.

- Ingestion and NRCS production builds passed (NRCS with webpack); both TypeScript checks passed. Phase A also recorded a root CMS TypeScript pass.
- `apps/calendar/_ingest/tests/structured-feeds.mjs` passed: recurrence, EXDATE/RDATE, moved/cancelled exceptions, DST, date-only/floating times, RSS profiles, XML rejection, public-address restrictions, staged retry without refetch, failed-run reporting, and NRCS contract compatibility.
- `tests/calendar-ingestion.mjs` passed against disposable PGlite PostgreSQL: actual migrations and seeds, payload/credential/district boundaries, permissions, run idempotency, draft approval, publication completeness, archive protection, rejection suppression, CMS visibility behavior, scan leases/concurrency, staging, replay, and service-only job access.
- Public feeds were downloaded and parsed **without submitting to NRCS**. For the September 23–December 22, 2026 test window: library 57 occurrences, Chamber 5, Dysart 13. Counts will change and are not acceptance constants. The library date interpretation was compared with an actual event detail page.
- Dysart was correctly marked partial for duplicate master UID `20200219T2111380Z-577241-286@localendar.com`. Some listings are date-only room bookings and require editorial judgment.
- `git diff --check` passed (line-ending warnings only).
- User-confirmed live Phase A test reached a saved draft. This does **not** establish that public publication/CMS visibility or Phase B real-feed ingestion passed live testing.

Not performed/confirmed: Phase B live migration, Vercel deployment, authenticated browser acceptance, deployed outbound-feed transport, Make real-feed execution, public publication/cancellation acceptance, long-running scheduling, production load/retention testing, and provider/browser scraping validation. Parser fixtures and database harnesses are not a substitute for these checks.

## Remaining work

- Accept Phase B end to end, then configure and validate daily Make orchestration. No daily schedule was activated by this implementation.
- Museum Wix adapter; a usable LPC city transport (city RSS returned 403, alternate CivicPlus JSON returned a Cloudflare challenge); Facebook Explore/provider support. Recheck access at restart. Do not treat a blocked page as an empty calendar.
- Provider selection and monthly provider/AI budget; paid integrations and extraction support remain undecided.
- Deterministic cross-source matching; review/apply diffs for existing Events with editorial concurrency protection.
- Public cancellation label/state, temporary archive synchronization, Smart Cancel, linked Follow-Ups, dashboard summaries, and safe complete-inventory/disappearance handling.
- Geography/native-town relationships and public Town filtering, classification mapping and disabled-type enforcement, and the public calendar's historical 500-row query limit before higher ingestion volume.
- Explicit source-image saving, rejection cleanup, and an operational retention policy for scan jobs/staged payloads. A stored purge-eligibility timestamp is not a scheduled cleanup job.
- Review the original specification against delivered behavior before declaring V1 complete; older decision documents include historical gaps that Phase A/B have since addressed.

## Non-obvious behavior and troubleshooting

- **Every current scan sets `inventory_complete=false`.** No disappearance alerts are generated. Do not change this merely because parsing succeeded.
- `/api/runs` accepts normalized candidates; `/api/scan` fetches a registered source. They are not interchangeable.
- Retry a timeout/busy request with the **same run UUID**. A recorded failed/partial run is complete; use a **new UUID** after correcting its cause. Staged retries reuse their original output/window even if the feed changes.
- `ok=true` means NRCS recorded the scan, not that fetching succeeded. Inspect `scan_status`, `scan_message`, and source history.
- Dates in canonical Event fields are district-local wall timestamps, not offset-bearing UTC strings. Evidence preserves original zone/UTC/date-only values. Do not silently strip offsets or manufacture all-day start times.
- The ingestion app has no database service-role key or CMS publication secret. Integration credentials cannot approve/publish. Keep secrets out of source files and notes.
- Previous live setup errors included missing `public.nrcs_calendar_sources` after an incomplete/wrong-target migration, and “Source disabled or missing.” Verify the NRCS database, full migration execution, source ID/enablement, and CMS district enablement before changing code.
- A synthetic `Manual integration test` fixture was used in live testing. Check whether it remains and keep it out of publication; its source excerpt explicitly says not to publish.
- Original specification is outside Git at `C:\Users\Dan\Downloads\KRTR_NRCS_Calendar_Ingestion_Beast_Mode_V1_Specification_v1.1(1).docx`. Its availability on a future machine is not guaranteed. Recorded user decisions take precedence.

## Future spin-up checklist

1. Read this file and the linked phase/source notes. Inspect `git status` and preserve/review the uncommitted Phase B work before switching branches, merging, or deploying. Check current remote/deployed revisions rather than assuming this snapshot describes production.
2. Inspect Make schedules, Vercel environments, source states, and applied migrations. Keep scans on demand while validating. Do not reset the database or blindly replay seeds over edited source configuration.
3. Restore locked dependencies with `npm ci` in the repository root, `apps/nrcs`, and `apps/calendar/_ingest` as needed. Run the checks below. Recheck feed URLs and current samples; archived September fixtures are historical evidence.
4. Verify Phase A prerequisites: CMS migration `supabase/migrations/20260923000100_calendar_draft_visibility.sql` and receiving route; NRCS foundation `supabase/nrcs/migrations/20260923000100_calendar_ingestion_foundation.sql` and seed migration `20260923000200_calendar_seed_sources.sql`. User reports establish partial live success, not an exhaustive migration audit.
5. Apply the **complete** `supabase/nrcs/migrations/20260924000100_calendar_structured_scans.sql` to **NRCS Supabase only**, if not already applied. Phase B requires no additional CMS migration. It does not enable sources.
6. In **NRCS Vercel**, configure `CALENDAR_INGEST_API_BASE_URL` to the ingestion deployment's canonical HTTPS origin and `CALENDAR_ORCHESTRATOR_SECRET` to the same existing secret used by ingestion/Make. Existing `NRCS_CALENDAR_INGEST_SECRET` must match NRCS and ingestion. In ingestion, retain `NRCS_API_BASE_URL` pointing to NRCS. Match environment pairs; preserve existing database/CMS settings. Deploy NRCS and ingestion with the Phase B code and lockfile. Both scan functions require a 60-second budget.
7. Enable the library source in NRCS, verify its Concrete CMS profile, and use Run Now. Inspect candidate dates/links/evidence, approve one to draft, save, and verify evidence remains. Repeat a scan: unchanged occurrences should not add new review items. Verify edited/published/archived records stay protected. Then test Chamber and Dysart.
8. Test Make `POST /api/scan` with the existing orchestrator bearer credential, JSON content type, and a fresh run UUID. Library seed ID is `cafe0000-0000-4000-8000-000000000003`; verify it still exists. Test timeout/retry behavior. Complete deliberate publication/CMS verification with suitable content, not the synthetic fixture.
9. Only after manual acceptance, configure daily Make discovery (`GET /api/sources`), iterate enabled supported sources, and call `/api/scan` once per source with fresh UUIDs. Confirm error handling and operational ownership before activating. Continue the remaining feature work separately.

### Local verification commands

Run in PowerShell from `C:\SITES\KRTR`; stop and address any failing command.

```powershell
npm --prefix apps/calendar/_ingest run typecheck
npm --prefix apps/nrcs run typecheck
npm --prefix apps/calendar/_ingest run build
npm --prefix apps/nrcs run build -- --webpack
node apps/calendar/_ingest/tests/structured-feeds.mjs

# Disposable database test dependency used in the original session.
# If missing, install @electric-sql/pglite in a temporary location first.
$env:PGLITE_MODULE = (Resolve-Path '.tmp/phase8-test/node_modules/@electric-sql/pglite').Path
node tests/calendar-ingestion.mjs
git diff --check
```

Optional historical public-feed dry run: set `FEED_FIXTURE_DIR` to a directory containing `dysart.txt`, `chamber.txt`, and `library.txt` before running the structured-feed harness. Original files were in ignored `.tmp/calendar-phase-b`; they and the temporary PGlite installation are **not guaranteed to exist in a new checkout**. The standard adapter harness does not require those downloads. These tests do not submit live events.

## Reference map

- [Phase B deployment and Make request examples](../../../docs/calendar-ingestion-phase-b.md)
- [Phase A foundation and database setup](../../../docs/calendar-ingestion-phase-a.md)
- [User decisions overriding the specification](../../../docs/calendar-ingestion-decisions.md)
- [Seed source assessment and URLs](../../../docs/calendar-ingestion-seed-sources.md)
- Ingestion implementation: `apps/calendar/_ingest/lib`, especially `scan.ts`, `publicFeed.ts`, `adapters/ical.ts`, and `adapters/rss.ts`.
- NRCS contract: `apps/nrcs/lib/calendarIngestion.ts`; Run Now action: `apps/nrcs/lib/calendarScanAction.ts`; integration routes: `apps/nrcs/app/api/calendar-ingestion`.
- Editorial screens: NRCS `/calendar-sources`, `/calendar-intake`, and `/events/[id]`.

Older Phase A/B notes describe implementation-time deployment status. Use this handoff's distinctions between local verification, user-reported live results, and unknown current infrastructure state when resuming.
